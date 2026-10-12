"use server";

import { revalidatePath } from "next/cache";

import { type ActionResult, describeDatabaseError, failure, success } from "@/lib/actions/result";
import { clientIpHeaders } from "@/lib/auth/client-ip";
import { ROUTES } from "@/lib/auth/routes";
import { requireSuperAdmin } from "@/lib/auth/session";
import { LABELS } from "@/lib/constants/labels";
import { purgeDueCenters } from "@/lib/platform/purge";
import { createClient } from "@/lib/supabase/server";
import { cancelDeletionSchema, purgeNowSchema, requestDeletionSchema } from "@/lib/validation/platform";

// Suppression définitive d'un centre : demande (30 jours), annulation, purge.
// La base vérifie le rôle, le statut, le nom retapé et l'échéance, et journalise.

function fieldErrorsOf(error: { issues: { path: PropertyKey[]; message: string }[] }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".");
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

async function platformClient() {
  await requireSuperAdmin();
  return createClient({ headers: await clientIpHeaders() });
}

function revalidateCenter(centerId: string) {
  revalidatePath(ROUTES.platform.home, "layout");
  revalidatePath(`${ROUTES.platform.centers}/${centerId}`);
}

export async function requestCenterDeletion(input: unknown): Promise<ActionResult<{ scheduledFor: string }>> {
  const parsed = requestDeletionSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  const supabase = await platformClient();
  const v = parsed.data;
  const { data, error } = await supabase.rpc("platform_request_center_deletion", {
    p_center_id: v.centerId,
    p_reason: v.reason,
    p_confirm_name: v.confirmName,
  });
  if (error || !data) return failure(error ? describeDatabaseError(error) : LABELS.actions.errors.unexpected);
  revalidateCenter(v.centerId);
  return success({ scheduledFor: data });
}

export async function cancelCenterDeletion(input: unknown): Promise<ActionResult> {
  const parsed = cancelDeletionSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  const supabase = await platformClient();
  const v = parsed.data;
  const { error } = await supabase.rpc("platform_cancel_center_deletion", { p_center_id: v.centerId, p_reason: v.note });
  if (error) return failure(describeDatabaseError(error));
  revalidateCenter(v.centerId);
  return success();
}

/**
 * Purge immédiate depuis la console, une fois le délai écoulé (même chemin que
 * la tâche quotidienne : fichiers puis données). Nom du centre retapé.
 */
export async function purgeCenterNow(input: unknown): Promise<ActionResult> {
  const parsed = purgeNowSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  const supabase = await platformClient();
  const v = parsed.data;
  const [{ data: center, error: centerError }, { data: deletion, error: deletionError }] = await Promise.all([
    supabase.rpc("platform_center", { p_center_id: v.centerId }).maybeSingle(),
    supabase.rpc("platform_center_deletion", { p_center_id: v.centerId }).maybeSingle(),
  ]);
  if (centerError || deletionError || !center || !deletion) return failure(LABELS.actions.errors.unexpected);
  if (v.confirmName.toLocaleLowerCase("fr") !== center.name.trim().toLocaleLowerCase("fr")) {
    return failure(LABELS.platformConsole.access.confirmMismatch, { confirmName: LABELS.platformConsole.access.confirmMismatch });
  }
  if (!deletion.due) return failure(LABELS.actions.errors.forbidden);

  const [result] = await purgeDueCenters(v.centerId);
  revalidateCenter(v.centerId);
  return result?.ok ? success() : failure(LABELS.platformConsole.deletion.purgeFailed);
}
