import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

export const PHOTO_BUCKET = "student-photos";
export const STAFF_PHOTO_BUCKET = "staff-photos";

/** Durée de validité des URL signées (secondes). */
const SIGNED_URL_TTL = 60 * 60;

/** Chemin de la photo d'un élève dans le bucket : {center_id}/{student_id}.jpg */
export function studentPhotoPath(centerId: string, studentId: string): string {
  return `${centerId}/${studentId}.jpg`;
}

/**
 * Chemin de la photo d'un membre de l'équipe : {center_id}/{profile_id}/{horodatage}.jpg.
 * Un nom unique à chaque changement : la nouvelle photo s'affiche sans cache.
 */
export function staffPhotoPath(centerId: string, profileId: string): string {
  return `${centerId}/${profileId}/${Date.now()}.jpg`;
}

/** Signature JPEG (FF D8 FF) : les photos sont compressées en JPEG côté client. */
export async function isJpeg(file: File): Promise<boolean> {
  const header = new Uint8Array(await file.slice(0, 3).arrayBuffer());
  return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
}

/**
 * URL signées des photos (bucket privé), en un seul appel.
 * Renvoie une table chemin → URL ; les chemins absents ou illisibles sont ignorés.
 */
export async function signPhotoUrls(
  supabase: SupabaseClient<Database>,
  paths: readonly (string | null | undefined)[],
  bucket: string = PHOTO_BUCKET,
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  const result = new Map<string, string>();
  if (unique.length === 0) return result;

  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(unique, SIGNED_URL_TTL);
  if (error || !data) return result;

  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) result.set(item.path, item.signedUrl);
  }
  return result;
}
