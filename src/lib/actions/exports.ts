"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { type ActionResult, describeDatabaseError, failure, success } from "@/lib/actions/result";
import { clientIpHeaders } from "@/lib/auth/client-ip";
import { ROUTES } from "@/lib/auth/routes";
import { requireSuperAdmin } from "@/lib/auth/session";
import { LABELS } from "@/lib/constants/labels";
import { generateCenterExport, signedExportUrl } from "@/lib/exports/generate";
import { createClient } from "@/lib/supabase/server";
import { centerExportSchema } from "@/lib/validation/platform";

/**
 * Demande d'export (super-admin) : la base vérifie le rôle, le motif et la
 * période, et journalise ; l'archive est générée après la réponse, avec la
 * clé service_role, pour cette demande uniquement.
 */
export async function requestCenterExport(input: unknown): Promise<ActionResult<{ exportId: string }>> {
  const parsed = centerExportSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.map(String).join(".");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return failure(LABELS.actions.errors.invalid, fieldErrors);
  }
  await requireSuperAdmin();
  const supabase = await createClient({ headers: await clientIpHeaders() });
  const v = parsed.data;
  const { data: exportId, error } = await supabase.rpc("platform_request_center_export", {
    p_center_id: v.centerId,
    p_reason_kind: v.reasonKind,
    p_reason_note: v.note,
    p_from: v.scope === "range" ? v.from : undefined,
    p_to: v.scope === "range" ? v.to : undefined,
  });
  if (error || !exportId) return failure(error ? describeDatabaseError(error) : LABELS.actions.errors.unexpected);

  after(() => generateCenterExport(exportId));
  revalidatePath(`${ROUTES.platform.centers}/${v.centerId}`);
  return success({ exportId });
}

/** Lien de téléchargement signé d'un export prêt (valable jusqu'à son expiration). */
export async function getCenterExportLink(exportId: string): Promise<ActionResult<{ url: string }>> {
  if (!/^[0-9a-f-]{36}$/i.test(exportId)) return failure(LABELS.actions.errors.invalid);
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_center_export_file", { p_export_id: exportId }).maybeSingle();
  if (error) return failure(describeDatabaseError(error));
  if (!data?.storage_path) return failure(LABELS.platformConsole.exports.linkUnavailable);
  const url = await signedExportUrl(data.storage_path, data.expires_at);
  return url ? success({ url }) : failure(LABELS.platformConsole.exports.linkUnavailable);
}
