import "server-only";

import { buildCenterExportArchive, exportFileName, type ExportData } from "@/lib/exports/center-export";
import { LABELS } from "@/lib/constants/labels";
import { createAdminClient } from "@/lib/supabase/admin";

/** Bucket privé des exports (aucune policy : clé service_role uniquement). */
export const EXPORT_BUCKET = "center-exports";

function casablancaNow(): string {
  const parts = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Africa/Casablanca",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

/**
 * Génère l'archive d'une demande en attente (après la réponse au navigateur) :
 * lecture par la base (seulement pour cette demande), dépôt dans le bucket
 * privé, puis lien activé pour 24 h. Toute erreur est enregistrée sur la
 * demande (jamais de données dans le message).
 */
export async function generateCenterExport(exportId: string): Promise<void> {
  const service = createAdminClient();
  try {
    const { data: request, error: requestError } = await service
      .from("center_exports")
      .select("id, center_id, reason_kind, reason_note, period_from, period_to, centers(name, slug)")
      .eq("id", exportId)
      .single();
    if (requestError || !request?.centers) throw new Error("Demande introuvable");

    const { data, error } = await service.rpc("export_center_data", { p_export_id: exportId });
    if (error || !data) throw new Error(error?.message ?? "Lecture impossible");

    const generatedAt = casablancaNow();
    const reasons: Record<string, string> = LABELS.platformConsole.exports.reasons;
    const archive = buildCenterExportArchive(data as unknown as ExportData, {
      centerName: request.centers.name,
      slug: request.centers.slug,
      generatedAt,
      periodFrom: request.period_from,
      periodTo: request.period_to,
      reason: [reasons[request.reason_kind] ?? request.reason_kind, request.reason_note].filter(Boolean).join(" — "),
    });

    const path = `${request.center_id}/${exportId}/${exportFileName(request.centers.slug, generatedAt)}`;
    const { error: uploadError } = await service.storage
      .from(EXPORT_BUCKET)
      .upload(path, archive, { contentType: "application/zip", upsert: false });
    if (uploadError) throw new Error(`Dépôt impossible : ${uploadError.message}`);

    const { error: completeError } = await service.rpc("complete_center_export", {
      p_export_id: exportId,
      p_storage_path: path,
      p_file_size: archive.byteLength,
    });
    if (completeError) {
      await service.storage.from(EXPORT_BUCKET).remove([path]);
      throw new Error(completeError.message);
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Erreur inconnue";
    console.error(`[export ${exportId}] ${message}`);
    await service.rpc("complete_center_export", { p_export_id: exportId, p_error: message });
  }
}

/** Liens expirés : fichiers supprimés du bucket, exports marqués « expirés ». */
export async function cleanupExpiredExports(): Promise<void> {
  const service = createAdminClient();
  const { data, error } = await service.rpc("expired_center_exports");
  if (error || !data || data.length === 0) return;
  const paths = data.map((row) => row.storage_path).filter((path): path is string => Boolean(path));
  if (paths.length > 0) {
    const { error: removeError } = await service.storage.from(EXPORT_BUCKET).remove(paths);
    if (removeError) return;
  }
  await service.rpc("mark_center_exports_expired", { p_export_ids: data.map((row) => row.export_id) });
}

/** Lien signé de téléchargement, valable jusqu'à l'expiration de l'export. */
export async function signedExportUrl(path: string, expiresAt: string): Promise<string | null> {
  const seconds = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
  if (seconds <= 0) return null;
  const service = createAdminClient();
  const { data, error } = await service.storage
    .from(EXPORT_BUCKET)
    .createSignedUrl(path, Math.min(seconds, 86_400), { download: path.split("/").pop() ?? true });
  return error ? null : data.signedUrl;
}
