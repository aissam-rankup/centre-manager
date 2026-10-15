import "server-only";

import { cleanupExpiredExports } from "@/lib/exports/generate";
import { createAdminClient } from "@/lib/supabase/admin";

type ServiceClient = ReturnType<typeof createAdminClient>;

/** Buckets dont les fichiers d'un centre sont rangés sous « {center_id}/ ». */
export const CENTER_BUCKETS = [
  "student-photos",
  "staff-photos",
  "center-branding",
  "receipts",
  "salary-receipts",
  "expense-receipts",
  "learning-resources",
  "center-exports",
] as const;

const PAGE = 1000;

/** Chemins de tous les fichiers sous un préfixe (dossiers parcourus). */
async function listFiles(service: ServiceClient, bucket: string, prefix: string): Promise<string[]> {
  const files: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await service.storage.from(bucket).list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(`${bucket} : ${error.message}`);
    for (const item of data) {
      const path = `${prefix}/${item.name}`;
      // Dossier : pas d'identifiant ; on descend.
      if (item.id === null) files.push(...(await listFiles(service, bucket, path)));
      else files.push(path);
    }
    if (data.length < PAGE) return files;
  }
}

/** Supprime tous les fichiers d'un centre dans chaque bucket ; renvoie leur nombre. */
export async function removeCenterFiles(service: ServiceClient, centerId: string): Promise<number> {
  let removed = 0;
  for (const bucket of CENTER_BUCKETS) {
    const files = await listFiles(service, bucket, centerId);
    for (let index = 0; index < files.length; index += 100) {
      const batch = files.slice(index, index + 100);
      const { error } = await service.storage.from(bucket).remove(batch);
      if (error) throw new Error(`${bucket} : ${error.message}`);
      removed += batch.length;
    }
  }
  return removed;
}

export type PurgeResult = { centerId: string; ok: boolean; files: number; rows: number; accounts: number; error?: string };

/**
 * Suppressions dues (délai de 30 jours écoulé) : fichiers du Storage d'abord,
 * puis données du centre (purge_center, qui revérifie l'échéance). Un échec
 * laisse le centre en attente : il sera repris au passage suivant.
 * `centerId` : un seul centre (console) ; sinon tous les centres dus (tâche quotidienne).
 */
export async function purgeDueCenters(centerId?: string): Promise<PurgeResult[]> {
  const service = createAdminClient();
  await cleanupExpiredExports().catch(() => undefined);
  const { data: due, error } = await service.rpc("centers_due_for_purge");
  if (error) throw new Error(error.message);
  const targets = due.filter((row) => !centerId || row.center_id === centerId);

  const results: PurgeResult[] = [];
  for (const target of targets) {
    try {
      const files = await removeCenterFiles(service, target.center_id);
      const { data, error: purgeError } = await service.rpc("purge_center", { p_center_id: target.center_id });
      if (purgeError) throw new Error(purgeError.message);
      const summary = (data ?? {}) as { rows?: number; accounts?: number };
      results.push({ centerId: target.center_id, ok: true, files, rows: summary.rows ?? 0, accounts: summary.accounts ?? 0 });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Erreur inconnue";
      console.error(`[purge ${target.center_id}] ${message}`);
      results.push({ centerId: target.center_id, ok: false, files: 0, rows: 0, accounts: 0, error: message });
    }
  }
  return results;
}
