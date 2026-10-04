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
  centerModuleSchema,
  centerPricingSchema,
  centerStatusSchema,
  dueDateSchema,
  newCenterSchema,
  parseAmount,
  planSchema,
  platformSettingsSchema,
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
export async function createCenter(input: unknown): Promise<ActionResult<{ centerId: string; inviteLink: string | null }>> {
  const parsed = newCenterSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  const supabase = await platform();
  const values = parsed.data;

  // 1. Compte Auth de l'administrateur, par invitation (clé service_role, serveur uniquement).
  //    Si le courriel ne peut pas partir (limite d'envoi du service de courriel), le
  //    compte est créé avec un lien d'invitation que le super-admin transmet lui-même.
  const service = createAdminClient();
  const redirectTo = await welcomeUrl();
  const metadata = { full_name: values.adminName };
  let userId: string;
  let inviteLink: string | null = null;
  const { data: invited, error: inviteError } = await service.auth.admin.inviteUserByEmail(values.adminEmail, {
    redirectTo,
    data: metadata,
  });
  if (!inviteError && invited.user) {
    userId = invited.user.id;
  } else if (inviteError?.code === "email_exists" || inviteError?.status === 422) {
    return failure(E.emailExists, { adminEmail: E.emailExists });
  } else {
    const { data: link, error: linkError } = await service.auth.admin.generateLink({
      type: "invite",
      email: values.adminEmail,
      options: { redirectTo, data: metadata },
    });
    if (linkError || !link.user) {
      if (linkError?.code === "email_exists") return failure(E.emailExists, { adminEmail: E.emailExists });
      return failure(E.inviteFailed);
    }
    userId = link.user.id;
    inviteLink = link.properties.action_link;
  }

  // 2. Centre, abonnement et profil admin, dans une seule transaction.
  const { data: centerId, error } = await supabase.rpc("platform_create_center", {
    p_name: values.name,
    p_slug: values.slug,
    p_center_type: values.centerType,
    p_custom_terms: termsToSave(values.centerType, values.customTerms),
    p_plan_key: values.plan,
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
  return success({ centerId, inviteLink });
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
    p_plan_key: v.plan,
    p_price: parseAmount(v.price),
    p_billing_interval: v.billingInterval,
    p_grace_days: Number(v.graceDays),
  });
  if (error) return failure(describeDatabaseError(error));
  revalidatePlatform(v.centerId);
  return success();
}

// ---------------------------------------------------------------------
// Modules et catalogue
// ---------------------------------------------------------------------
/** Active ou coupe un module pour un centre (journalisé dans platform_events). */
export async function setCenterModule(input: unknown): Promise<ActionResult> {
  const parsed = centerModuleSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid);
  const supabase = await platform();
  const v = parsed.data;
  const { error } = await supabase.rpc("platform_set_center_module", {
    p_center_id: v.centerId,
    p_module_key: v.moduleKey,
    p_enabled: v.enabled,
    p_trial: v.trial,
  });
  if (error) return failure(describeDatabaseError(error));
  revalidatePlatform(v.centerId);
  return success();
}

/** Nom, description et prix catalogue d'un pack. */
export async function updatePlan(input: unknown): Promise<ActionResult> {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  const supabase = await platform();
  const v = parsed.data;
  const { error } = await supabase.rpc("platform_update_plan", {
    p_key: v.key,
    p_name: v.name,
    p_description: v.description,
    p_monthly_price: parseAmount(v.monthlyPrice),
  });
  if (error) return failure(describeDatabaseError(error));
  revalidatePlatform();
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
export async function resendInvitation(input: unknown): Promise<ActionResult<{ passwordLink: boolean; link: string | null }>> {
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

  // Marque blanche : le courriel porte le nom de marque du centre (modèles Auth : .Data.brand_name).
  const { data: branding } = await supabase.rpc("center_branding_settings", { p_center_id: centerId }).maybeSingle();
  const brandName = branding?.white_label ? branding.brand_name : null;
  await service.auth.admin.updateUserById(userId, {
    user_metadata: { ...user.user.user_metadata, brand_name: brandName },
  });

  const redirectTo = await welcomeUrl();
  const { error } = passwordLink
    ? await service.auth.resetPasswordForEmail(user.user.email, { redirectTo })
    : await service.auth.admin.inviteUserByEmail(user.user.email, { redirectTo });
  if (!error) {
    revalidatePlatform(centerId);
    return success({ passwordLink, link: null });
  }
  // Courriel refusé (limite d'envoi…) : lien à transmettre par le super-admin.
  const { data: generated, error: linkError } = await service.auth.admin.generateLink(
    passwordLink
      ? { type: "recovery", email: user.user.email, options: { redirectTo } }
      : { type: "invite", email: user.user.email, options: { redirectTo } },
  );
  if (linkError) return failure(E.inviteFailed);
  revalidatePlatform(centerId);
  return success({ passwordLink, link: generated.properties.action_link });
}

export async function updatePlatformSettings(input: unknown): Promise<ActionResult> {
  const parsed = platformSettingsSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  const supabase = await platform();
  const v = parsed.data;
  const { error } = await supabase.rpc("platform_update_settings", {
    p_support_name: v.name,
    p_support_phone: phoneOrNull(v.phone) ?? "",
    p_support_email: v.email,
  });
  if (error) return failure(describeDatabaseError(error));
  revalidatePath(ROUTES.platform.settings);
  return success();
}
