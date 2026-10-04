"use server";

import { promises as dns } from "node:dns";

import { revalidatePath } from "next/cache";

import { type ActionResult, describeDatabaseError, failure, success } from "@/lib/actions/result";
import { ROUTES } from "@/lib/auth/routes";
import { getAuthState } from "@/lib/auth/session";
import { dnsTarget } from "@/lib/branding";
import { LABELS } from "@/lib/constants/labels";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import {
  BRANDING_IMAGE_KINDS,
  BRANDING_IMAGE_MAX_BYTES,
  BRANDING_IMAGE_TYPES,
  type BrandingImageKind,
  brandingFormSchema,
} from "@/lib/validation/branding";

const BUCKET = "center-branding";
const L = LABELS.branding;

/**
 * Centre dont l'appelant peut modifier la marque : n'importe lequel pour le
 * super-admin (hors support), le sien pour l'administrateur d'un centre en
 * marque blanche. La base revérifie (private.can_edit_branding).
 */
async function editableCenter(requested: string): Promise<{ centerId: string; superAdmin: boolean } | null> {
  const state = await getAuthState();
  if (state.status !== "authenticated" || !state.profile.active || state.profile.blocked) return null;
  const { profile } = state;
  if (profile.role === "super_admin" && !profile.support) return { centerId: requested, superAdmin: true };
  if (profile.role === "admin" && !profile.support && profile.modules.includes("white_label") && profile.centerId === requested) {
    return { centerId: requested, superAdmin: false };
  }
  return null;
}

function revalidateBranding(centerId: string) {
  revalidatePath("/", "layout");
  revalidatePath(`${ROUTES.platform.centers}/${centerId}`);
}

export async function saveBranding(input: unknown): Promise<ActionResult> {
  const parsed = brandingFormSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return failure(LABELS.actions.errors.invalid, fieldErrors);
  }
  const v = parsed.data;
  const target = await editableCenter(v.centerId);
  if (!target) return failure(LABELS.actions.errors.forbidden);

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_center_branding", {
    p_center_id: v.centerId,
    p_brand_name: v.brandName,
    p_logo_url: v.logoUrl,
    p_favicon_url: v.faviconUrl,
    p_primary_color: v.primaryColor,
    p_secondary_color: v.secondaryColor,
    p_accent_color: v.accentColor,
    p_login_background_url: v.loginBackgroundUrl,
    p_email_sender_name: v.senderName,
    p_support_email: v.supportEmail,
    p_support_phone: v.supportPhone ? formatPhone(v.supportPhone) : "",
    // Ignoré en base pour un administrateur de centre.
    p_custom_domain: target.superAdmin ? v.customDomain : undefined,
  });
  if (error) return failure(describeDatabaseError(error));
  revalidateBranding(v.centerId);
  return success();
}

/** Envoi d'une image de marque ; renvoie son adresse publique (enregistrée avec le formulaire). */
export async function uploadBrandingImage(formData: FormData): Promise<ActionResult<{ url: string }>> {
  const centerId = String(formData.get("centerId") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const file = formData.get("file");
  if (!/^[0-9a-f-]{36}$/.test(centerId) || !BRANDING_IMAGE_KINDS.includes(kind as BrandingImageKind)) {
    return failure(LABELS.actions.errors.invalid);
  }
  if (!(file instanceof File) || file.size === 0 || file.size > BRANDING_IMAGE_MAX_BYTES) return failure(L.uploadFailed);
  const extension = BRANDING_IMAGE_TYPES[file.type];
  if (!extension) return failure(L.uploadFailed);
  if (!(await editableCenter(centerId))) return failure(LABELS.actions.errors.forbidden);

  const supabase = await createClient();
  const path = `${centerId}/${kind}-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) return failure(L.uploadFailed);
  return success({ url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl });
}

async function pointsTo(domain: string, target: string): Promise<boolean> {
  const cnames = await dns.resolveCname(domain).catch(() => [] as string[]);
  if (cnames.some((name) => name.toLowerCase().replace(/\.$/, "") === target)) return true;
  // Domaine racine (pas de CNAME possible) : mêmes adresses IP que la cible.
  const [mine, theirs] = await Promise.all([
    dns.resolve4(domain).catch(() => [] as string[]),
    dns.resolve4(target).catch(() => [] as string[]),
  ]);
  return mine.length > 0 && mine.every((ip) => theirs.includes(ip));
}

/** Vérification du domaine personnalisé (super-admin) : enregistrement DNS, puis statut en base. */
export async function verifyCustomDomain(centerId: string): Promise<ActionResult<{ verified: boolean }>> {
  const target = await editableCenter(centerId);
  if (!target?.superAdmin) return failure(LABELS.actions.errors.forbidden);
  const destination = dnsTarget();
  if (!destination) return failure(L.noTarget);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("center_branding_settings", { p_center_id: centerId }).maybeSingle();
  if (error) return failure(describeDatabaseError(error));
  if (!data?.custom_domain) return failure(L.domainInvalid);

  const verified = await pointsTo(data.custom_domain, destination);
  const { error: saveError } = await supabase.rpc("platform_set_domain_verified", { p_center_id: centerId, p_verified: verified });
  if (saveError) return failure(describeDatabaseError(saveError));
  revalidateBranding(centerId);
  return success({ verified });
}
