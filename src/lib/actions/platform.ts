"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { type ActionResult, describeDatabaseError, failure, success } from "@/lib/actions/result";
import { ROUTES } from "@/lib/auth/routes";
import { requireSuperAdmin } from "@/lib/auth/session";
import { LABELS } from "@/lib/constants/labels";
import { publicEnv } from "@/lib/env";
import { formatPhone } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  centerDetailsSchema,
  centerPricingSchema,
  centerStatusSchema,
  dueDateSchema,
  newCenterSchema,
  parseAmount,
  resendInvitationSchema,
  subscriptionPaymentSchema,
  termsToSave,
} from "@/lib/validation/platform";

const E = LABELS.platform.errors;

type FieldErrors = Record<string, string>;

function fieldErrorsOf(error: { issues: { path: PropertyKey[]; message: string }[] }): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".");
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

/** Garde de chaque action : super-admin relu en base (404 sinon), puis client de session. */
async function platform() {
  await requireSuperAdmin();
  return createClient();
}

function revalidatePlatform(centerId?: string) {
  revalidatePath(ROUTES.platform.home, "layout");
  if (centerId) revalidatePath(`${ROUTES.platform.centers}/${centerId}`);
}

/** Page d'accueil des invités (choix du mot de passe), sur l'hôte courant. */
async function welcomeUrl(): Promise<string> {
  const origin = (await headers()).get("origin") ?? publicEnv.NEXT_PUBLIC_APP_URL ?? "";
  return `${origin}${ROUTES.welcome}`;
}

const phoneOrNull = (value: string) => (value ? formatPhone(value) : null);

// ---------------------------------------------------------------------
// Création d'un centre
// ---------------------------------------------------------------------
export async function createCenter(input: unknown): Promise<ActionResult<{ centerId: string }>> {
  const parsed = newCenterSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  const supabase = await platform();
  const values = parsed.data;

  // 1. Compte Auth de l'administrateur, par invitation (clé service_role, serveur uniquement).
  const service = createAdminClient();
  const { data: invited, error: inviteError } = await service.auth.admin.inviteUserByEmail(values.adminEmail, {
    redirectTo: await welcomeUrl(),
    data: { full_name: values.adminName },
  });
  if (inviteError || !invited.user) {
    if (inviteError?.code === "email_exists" || inviteError?.status === 422) {
      return failure(E.emailExists, { adminEmail: E.emailExists });
    }
    return failure(E.inviteFailed);
  }
  const userId = invited.user.id;

  // 2. Centre, abonnement et profil admin, dans une seule transaction.
  const { data: centerId, error } = await supabase.rpc("platform_create_center", {
    p_name: values.name,
    p_slug: values.slug,
    p_center_type: values.centerType,
    p_custom_terms: termsToSave(values.centerType, values.customTerms),
    p_plan: values.plan,
    p_price: parseAmount(values.price),
    p_billing_interval: values.billingInterval,
    p_status: values.status,
    p_activation_date: values.activationDate,
    p_first_period_end: values.firstDueDate,
    p_grace_days: Number(values.graceDays),
    p_owner_contact_name: values.ownerName,
    p_owner_contact_phone: phoneOrNull(values.ownerPhone) ?? "",
    p_owner_contact_email: values.ownerEmail,
    p_notes: values.notes,
    p_admin_user_id: userId,
    p_admin_full_name: values.adminName,
    p_admin_phone: phoneOrNull(values.adminPhone) ?? "",
  });
  if (error || !centerId) {
    // Pas de compte orphelin : l'invitation est annulée.
    await service.auth.admin.deleteUser(userId);
    if (error?.code === "23505") return failure(E.slugTaken, { slug: E.slugTaken });
    return failure(error ? describeDatabaseError(error) : LABELS.actions.errors.unexpected);
  }

  revalidatePlatform();
  return success({ centerId });
}

// ---------------------------------------------------------------------
// Fiche centre
// ---------------------------------------------------------------------
export async function updateCenterDetails(input: unknown): Promise<ActionResult> {
  const parsed = centerDetailsSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  const supabase = await platform();
  const v = parsed.data;
  const { error } = await supabase.rpc("platform_update_center", {
    p_center_id: v.centerId,
    p_name: v.name,
    p_slug: v.slug,
    p_center_type: v.centerType,
    p_custom_terms: termsToSave(v.centerType, v.customTerms),
    p_owner_contact_name: v.ownerName,
    p_owner_contact_phone: phoneOrNull(v.ownerPhone) ?? "",
    p_owner_contact_email: v.ownerEmail,
    p_notes: v.notes,
  });
  if (error) {
    if (error.code === "23505") return failure(E.slugTaken, { slug: E.slugTaken });
    return failure(describeDatabaseError(error));
  }
  revalidatePlatform(v.centerId);
  return success();
}

export async function updateCenterPricing(input: unknown): Promise<ActionResult> {
  const parsed = centerPricingSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  const supabase = await platform();
  const v = parsed.data;
  const { error } = await supabase.rpc("platform_set_pricing", {
    p_center_id: v.centerId,
    p_plan: v.plan,
    p_price: parseAmount(v.price),
    p_billing_interval: v.billingInterval,
    p_grace_days: Number(v.graceDays),
  });
  if (error) return failure(describeDatabaseError(error));
  revalidatePlatform(v.centerId);
  return success();
}

export async function updateCenterDueDate(input: unknown): Promise<ActionResult> {
  const parsed = dueDateSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  const supabase = await platform();
  const v = parsed.data;
  const { error } = await supabase.rpc("platform_set_due_date", {
    p_center_id: v.centerId,
    p_due_date: v.dueDate,
    p_reason: v.reason,
  });
  if (error) return failure(describeDatabaseError(error));
  revalidatePlatform(v.centerId);
  return success();
}

export async function recordSubscriptionPayment(input: unknown): Promise<ActionResult> {
  const parsed = subscriptionPaymentSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  const supabase = await platform();
  const v = parsed.data;
  const { error } = await supabase.rpc("platform_record_payment", {
    p_center_id: v.centerId,
    p_amount: parseAmount(v.amount),
    p_paid_at: v.paidAt,
    p_method: v.method,
    p_reference: v.reference,
  });
  if (error) return failure(describeDatabaseError(error));
  revalidatePlatform(v.centerId);
  return success();
}

export async function updateCenterStatus(input: unknown): Promise<ActionResult> {
  const parsed = centerStatusSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  const supabase = await platform();
  const v = parsed.data;
  const { error } = await supabase.rpc("platform_set_status", {
    p_center_id: v.centerId,
    p_status: v.status,
    p_reason: v.reason,
  });
  if (error) return failure(describeDatabaseError(error));
  revalidatePlatform(v.centerId);
  return success();
}

/**
 * Accès d'un compte du centre : nouvelle invitation s'il n'a jamais ouvert
 * son lien, sinon lien de choix du mot de passe (récupération).
 */
export async function resendInvitation(input: unknown): Promise<ActionResult<{ passwordLink: boolean }>> {
  const parsed = resendInvitationSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid);
  const supabase = await platform();
  const { centerId, userId } = parsed.data;

  const service = createAdminClient();
  const { data: user, error: userError } = await service.auth.admin.getUserById(userId);
  if (userError || !user.user.email) return failure(LABELS.actions.errors.unexpected);
  const passwordLink = Boolean(user.user.last_sign_in_at || user.user.email_confirmed_at);

  // Journalisation d'abord : elle vérifie aussi que le compte appartient au centre.
  const { error: logError } = await supabase.rpc("platform_log_invitation", {
    p_center_id: centerId,
    p_user_id: userId,
    p_password_link: passwordLink,
  });
  if (logError) return failure(describeDatabaseError(logError));

  const redirectTo = await welcomeUrl();
  const { error } = passwordLink
    ? await service.auth.resetPasswordForEmail(user.user.email, { redirectTo })
    : await service.auth.admin.inviteUserByEmail(user.user.email, { redirectTo });
  if (error) return failure(E.inviteFailed);
  revalidatePlatform(centerId);
  return success({ passwordLink });
}
