"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, failure, success } from "@/lib/actions/result";
import { ROUTES } from "@/lib/auth/routes";
import { requireStaff } from "@/lib/auth/session";
import { describeCenterError, getLabels } from "@/lib/i18n/server";
import { searchStudentDirectory, type StudentListItem } from "@/lib/data/assistant";
import { formatPhone } from "@/lib/phone";
import { isJpeg, PHOTO_BUCKET, studentPhotoPath } from "@/lib/storage/photos";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { assistantSchemas, PHOTO_MAX_BYTES } from "@/lib/validation/assistant";

/** Schémas dans le vocabulaire du centre connecté. */
async function assistantSchemasNow() {
  return assistantSchemas(await getLabels());
}

/** Première erreur de chaque champ, pour l'affichage sous les champs du formulaire. */
function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !result[key]) result[key] = issue.message;
  }
  return result;
}

function revalidateAssistant() {
  revalidatePath(ROUTES.assistant.home, "layout");
}

// ---------------------------------------------------------------------
// Recherche instantanée
// ---------------------------------------------------------------------
export async function searchStudents(query: string): Promise<ActionResult<StudentListItem[]>> {
  const LABELS = await getLabels();
  const E = LABELS.actions.errors;
  const parsed = z.string().max(100).safeParse(query);
  if (!parsed.success) return failure(E.invalid);
  try {
    return success(await searchStudentDirectory(parsed.data));
  } catch {
    return failure(E.unexpected);
  }
}

// ---------------------------------------------------------------------
// Relance
// ---------------------------------------------------------------------
export async function recordFollowUp(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const E = LABELS.actions.errors;
  const parsed = (await assistantSchemasNow()).followUpSchema.safeParse(input);
  if (!parsed.success) return failure(E.invalid, fieldErrorsOf(parsed.error));

  const profile = await requireStaff();
  const supabase = await createClient();
  const { studentId, invoiceId, type, channel, note } = parsed.data;

  const { error } = await supabase.from("follow_ups").insert({
    student_id: studentId,
    invoice_id: type === "payment" ? invoiceId : null,
    type,
    channel,
    note: note || null,
    created_by: profile.id,
  });
  if (error) return failure(await describeCenterError(error));

  revalidateAssistant();
  return success();
}

// ---------------------------------------------------------------------
// Nouvel élève
// ---------------------------------------------------------------------
export async function createStudent(formData: FormData): Promise<ActionResult<{ studentId: string }>> {
  const LABELS = await getLabels();
  const E = LABELS.actions.errors;
  const S = LABELS.assistant.newStudent;

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("data") ?? ""));
  } catch {
    return failure(E.invalid);
  }
  const parsed = (await assistantSchemasNow()).newStudentSchema.safeParse(raw);
  if (!parsed.success) return failure(E.invalid, fieldErrorsOf(parsed.error));

  const photo = formData.get("photo");
  const hasPhoto = photo instanceof File && photo.size > 0;
  if (hasPhoto) {
    if (photo.size > PHOTO_MAX_BYTES) return failure(S.validation.photoTooLarge, { photo: S.validation.photoTooLarge });
    if (!(await isJpeg(photo))) return failure(S.validation.photoInvalid, { photo: S.validation.photoInvalid });
  }

  const profile = await requireStaff();
  const supabase = await createClient();
  const studentId = crypto.randomUUID();
  const values = parsed.data;

  let photoPath: string | null = null;
  if (hasPhoto) {
    photoPath = studentPhotoPath(profile.centerId, studentId);
    const { error: uploadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(photoPath, photo, { contentType: "image/jpeg", upsert: false });
    if (uploadError) return failure(S.errors.photoUpload);
  }

  const { error } = await supabase.rpc("create_student", {
    p_student_id: studentId,
    p_full_name: values.fullName,
    p_level_id: values.levelId,
    p_subject_ids: values.formula === "unit" ? values.subjectIds : [],
    p_pack_id: values.formula === "pack" ? values.packId : undefined,
    p_billing_day: Number(values.billingDay),
    p_guardian_name: values.guardianName || undefined,
    p_guardian_phone: values.guardianPhone ? formatPhone(values.guardianPhone) : undefined,
    p_notes: values.notes || undefined,
    p_photo_path: photoPath ?? undefined,
  });

  if (error) {
    // Photo orpheline : l'assistant n'a pas le droit de supprimer, on nettoie côté serveur.
    if (photoPath) await createAdminClient().storage.from(PHOTO_BUCKET).remove([photoPath]);
    return failure(await describeCenterError(error));
  }

  revalidateAssistant();
  return success({ studentId });
}

// ---------------------------------------------------------------------
// Nouveau professeur
// ---------------------------------------------------------------------
export async function createTeacher(input: unknown): Promise<ActionResult<{ email: string }>> {
  const LABELS = await getLabels();
  const E = LABELS.actions.errors;
  const T = LABELS.assistant.newTeacher;

  const parsed = (await assistantSchemasNow()).newTeacherSchema.safeParse(input);
  if (!parsed.success) return failure(E.invalid, fieldErrorsOf(parsed.error));

  const profile = await requireStaff();
  const supabase = await createClient();
  const values = parsed.data;

  // Niveau de chaque matière (lu avec la session : matières du centre uniquement).
  const { data: subjects, error: subjectsError } = await supabase
    .from("subjects")
    .select("id, level_id")
    .in("id", values.subjectIds);
  if (subjectsError) return failure(await describeCenterError(subjectsError));
  if (subjects.length !== new Set(values.subjectIds).size) return failure(E.invalid);

  // Seule la création du compte Auth utilise la clé service_role.
  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: values.email,
    password: values.password,
    email_confirm: true,
    user_metadata: { full_name: values.fullName },
  });

  if (createError || !created.user) {
    if (createError?.code === "email_exists") return failure(T.errors.emailExists, { email: T.errors.emailExists });
    if (createError?.code === "weak_password") return failure(T.errors.weakPassword, { password: T.errors.weakPassword });
    return failure(E.unexpected);
  }

  const userId = created.user.id;

  // Profil et affectations insérés avec la session de l'utilisateur : la RLS s'applique.
  const { error: profileError } = await supabase.from("profiles").insert({
    id: userId,
    center_id: profile.centerId,
    full_name: values.fullName,
    role: "teacher",
    phone: formatPhone(values.phone),
  });

  const { error: assignmentsError } = profileError
    ? { error: null }
    : await supabase
        .from("teacher_assignments")
        .insert(subjects.map((subject) => ({ teacher_id: userId, subject_id: subject.id, level_id: subject.level_id })));

  const writeError = profileError ?? assignmentsError;
  if (writeError) {
    // Annulation : suppression du compte Auth (le profil suit par cascade).
    await admin.auth.admin.deleteUser(userId);
    return failure(await describeCenterError(writeError));
  }

  revalidateAssistant();
  return success({ email: values.email });
}
