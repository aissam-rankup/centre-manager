import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

export const PHOTO_BUCKET = "student-photos";

/** Durée de validité des URL signées (secondes). */
const SIGNED_URL_TTL = 60 * 60;

/** Chemin de la photo d'un élève dans le bucket : {center_id}/{student_id}.jpg */
export function studentPhotoPath(centerId: string, studentId: string): string {
  return `${centerId}/${studentId}.jpg`;
}

/**
 * URL signées des photos (bucket privé), en un seul appel.
 * Renvoie une table chemin → URL ; les chemins absents ou illisibles sont ignorés.
 */
export async function signPhotoUrls(
  supabase: SupabaseClient<Database>,
  paths: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  const result = new Map<string, string>();
  if (unique.length === 0) return result;

  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(unique, SIGNED_URL_TTL);
  if (error || !data) return result;

  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) result.set(item.path, item.signedUrl);
  }
  return result;
}
