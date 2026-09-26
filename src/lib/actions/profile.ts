"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, describeDatabaseError, failure, success } from "@/lib/actions/result";
import { requireRole } from "@/lib/auth/session";
import { LABELS } from "@/lib/constants/labels";
import { isJpeg, STAFF_PHOTO_BUCKET, staffPhotoPath } from "@/lib/storage/photos";
import { createClient } from "@/lib/supabase/server";
import { PHOTO_MAX_BYTES } from "@/lib/validation/assistant";

const P = LABELS.auth.photo;
const V = LABELS.assistant.newStudent.validation;

/** Photo envoyée par le formulaire : JPEG compressé côté client, 2 Mo maximum. */
async function readPhoto(formData: FormData): Promise<File | string> {
  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return V.photoInvalid;
  if (photo.size > PHOTO_MAX_BYTES) return V.photoTooLarge;
  if (!(await isJpeg(photo))) return V.photoInvalid;
  return photo;
}

// ---------------------------------------------------------------------
// Sa propre photo (tous les rôles)
// ---------------------------------------------------------------------
export async function updateMyPhoto(formData: FormData): Promise<ActionResult> {
  const photo = await readPhoto(formData);
  if (typeof photo === "string") return failure(photo);

  const profile = await requireRole(["admin", "assistant", "teacher"]);
  const supabase = await createClient();
  const path = staffPhotoPath(profile.centerId, profile.id);

  const { error: uploadError } = await supabase.storage
    .from(STAFF_PHOTO_BUCKET)
    .upload(path, photo, { contentType: "image/jpeg", upsert: false });
  if (uploadError) return failure(P.uploadFailed);

  const { error } = await supabase.rpc("set_my_photo", { p_path: path });
  if (error) {
    await supabase.storage.from(STAFF_PHOTO_BUCKET).remove([path]);
    return failure(describeDatabaseError(error));
  }

  // L'ancienne photo n'est plus référencée.
  if (profile.photoPath) await supabase.storage.from(STAFF_PHOTO_BUCKET).remove([profile.photoPath]);

  revalidatePath("/", "layout");
  return success();
}

export async function removeMyPhoto(): Promise<ActionResult> {
  const profile = await requireRole(["admin", "assistant", "teacher"]);
  const supabase = await createClient();

  const { error } = await supabase.rpc("set_my_photo", {});
  if (error) return failure(describeDatabaseError(error));
  if (profile.photoPath) await supabase.storage.from(STAFF_PHOTO_BUCKET).remove([profile.photoPath]);

  revalidatePath("/", "layout");
  return success();
}

// ---------------------------------------------------------------------
// Photo d'un membre du centre (admin)
// ---------------------------------------------------------------------
async function currentPhotoPath(userId: string): Promise<string | null | undefined> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("photo_url").eq("id", userId).maybeSingle();
  return data ? data.photo_url : undefined;
}

export async function setUserPhoto(userId: string, formData: FormData): Promise<ActionResult> {
  if (!z.uuid().safeParse(userId).success) return failure(LABELS.actions.errors.invalid);
  const photo = await readPhoto(formData);
  if (typeof photo === "string") return failure(photo);

  const admin = await requireRole("admin");
  const supabase = await createClient();
  const previous = await currentPhotoPath(userId);
  if (previous === undefined) return failure(LABELS.actions.errors.notFound);

  const path = staffPhotoPath(admin.centerId, userId);
  const { error: uploadError } = await supabase.storage
    .from(STAFF_PHOTO_BUCKET)
    .upload(path, photo, { contentType: "image/jpeg", upsert: false });
  if (uploadError) return failure(P.uploadFailed);

  const { error } = await supabase.from("profiles").update({ photo_url: path }).eq("id", userId);
  if (error) {
    await supabase.storage.from(STAFF_PHOTO_BUCKET).remove([path]);
    return failure(describeDatabaseError(error));
  }
  if (previous) await supabase.storage.from(STAFF_PHOTO_BUCKET).remove([previous]);

  revalidatePath("/", "layout");
  return success();
}

export async function removeUserPhoto(userId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(userId).success) return failure(LABELS.actions.errors.invalid);
  await requireRole("admin");
  const supabase = await createClient();
  const previous = await currentPhotoPath(userId);
  if (previous === undefined) return failure(LABELS.actions.errors.notFound);

  const { error } = await supabase.from("profiles").update({ photo_url: null }).eq("id", userId);
  if (error) return failure(describeDatabaseError(error));
  if (previous) await supabase.storage.from(STAFF_PHOTO_BUCKET).remove([previous]);

  revalidatePath("/", "layout");
  return success();
}
