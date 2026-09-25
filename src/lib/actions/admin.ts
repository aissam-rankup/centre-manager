"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, describeDatabaseError, failure, success } from "@/lib/actions/result";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole } from "@/lib/auth/session";
import { LABELS } from "@/lib/constants/labels";
import { formatPhone } from "@/lib/phone";
import { PHOTO_BUCKET } from "@/lib/storage/photos";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  enrollmentCreateSchema,
  enrollmentUpdateSchema,
  levelSchema,
  slotSchema,
  studentUpdateSchema,
  subjectSchema,
  userCreateSchema,
  userUpdateSchema,
} from "@/lib/validation/admin";

const E = LABELS.admin.errors;

type DatabaseError = { code?: string; message?: string };

/** Erreurs propres à l'administration, puis traduction générique. */
function describeAdminError(error: DatabaseError): string {
  if (error.code === "23503") return E.inUse;
  if (error.code === "23505") return E.duplicate;
  if (error.code === "23P01") {
    return error.message?.includes("schedule_slots_no_room_overlap") ? E.roomConflict : E.teacherConflict;
  }
  return describeDatabaseError(error);
}

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !result[key]) result[key] = issue.message;
  }
  return result;
}

async function admin() {
  const profile = await requireRole("admin");
  return { profile, supabase: await createClient() };
}

function revalidateAdmin() {
  revalidatePath(ROUTES.admin.home, "layout");
}

const idSchema = z.uuid();

// ---------------------------------------------------------------------
// Niveaux
// ---------------------------------------------------------------------
export async function saveLevel(input: unknown): Promise<ActionResult> {
  const parsed = levelSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  const { profile, supabase } = await admin();
  const { id, name, sortOrder } = parsed.data;

  const { error } = id
    ? await supabase.from("levels").update({ name, sort_order: sortOrder }).eq("id", id)
    : await supabase.from("levels").insert({ center_id: profile.centerId, name, sort_order: sortOrder });
  if (error) return failure(describeAdminError(error), error.code === "23505" ? { name: E.duplicate } : undefined);

  revalidateAdmin();
  return success();
}

export async function deleteLevel(levelId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(levelId).success) return failure(LABELS.actions.errors.invalid);
  const { supabase } = await admin();
  const { error } = await supabase.from("levels").delete().eq("id", levelId);
  if (error) return failure(describeAdminError(error));
  revalidateAdmin();
  return success();
}

// ---------------------------------------------------------------------
// Matières
// ---------------------------------------------------------------------
export async function saveSubject(input: unknown): Promise<ActionResult> {
  const parsed = subjectSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  const { profile, supabase } = await admin();
  const { id, levelId, name, monthlyPrice } = parsed.data;

  const { error } = id
    ? await supabase.from("subjects").update({ name, monthly_price: monthlyPrice }).eq("id", id)
    : await supabase
        .from("subjects")
        .insert({ center_id: profile.centerId, level_id: levelId, name, monthly_price: monthlyPrice });
  if (error) return failure(describeAdminError(error), error.code === "23505" ? { name: E.duplicate } : undefined);

  revalidateAdmin();
  return success();
}

export async function deleteSubject(subjectId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(subjectId).success) return failure(LABELS.actions.errors.invalid);
  const { supabase } = await admin();
  const { error } = await supabase.from("subjects").delete().eq("id", subjectId);
  if (error) return failure(describeAdminError(error));
  revalidateAdmin();
  return success();
}

// ---------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------
export async function saveSlot(input: unknown): Promise<ActionResult> {
  const parsed = slotSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  const { profile, supabase } = await admin();
  const { id, subjectId, teacherId, dayOfWeek, startTime, endTime, room } = parsed.data;

  const { data: subject, error: subjectError } = await supabase
    .from("subjects")
    .select("level_id")
    .eq("id", subjectId)
    .maybeSingle();
  if (subjectError) return failure(describeAdminError(subjectError));
  if (!subject) return failure(LABELS.actions.errors.notFound);

  const values = {
    subject_id: subjectId,
    level_id: subject.level_id,
    teacher_id: teacherId,
    day_of_week: dayOfWeek,
    start_time: startTime,
    end_time: endTime,
    room,
  };
  const { error } = id
    ? await supabase.from("schedule_slots").update(values).eq("id", id)
    : await supabase.from("schedule_slots").insert({ ...values, center_id: profile.centerId });
  if (error) return failure(describeAdminError(error));

  revalidateAdmin();
  revalidatePath(ROUTES.teacher.home, "layout");
  return success();
}

export async function deleteSlot(slotId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(slotId).success) return failure(LABELS.actions.errors.invalid);
  const { supabase } = await admin();
  const { error } = await supabase.from("schedule_slots").delete().eq("id", slotId);
  if (error) return failure(describeAdminError(error));
  revalidateAdmin();
  revalidatePath(ROUTES.teacher.home, "layout");
  return success();
}

// ---------------------------------------------------------------------
// Utilisateurs
// ---------------------------------------------------------------------
async function assignmentRows(supabase: Awaited<ReturnType<typeof createClient>>, teacherId: string, subjectIds: string[]) {
  if (subjectIds.length === 0) return { rows: [], error: null };
  const { data, error } = await supabase.from("subjects").select("id, level_id").in("id", subjectIds);
  if (error) return { rows: [], error };
  return { rows: data.map((s) => ({ teacher_id: teacherId, subject_id: s.id, level_id: s.level_id })), error: null };
}

export async function createUser(input: unknown): Promise<ActionResult<{ email: string }>> {
  const parsed = userCreateSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  const { profile, supabase } = await admin();
  const values = parsed.data;
  const T = LABELS.assistant.newTeacher.errors;

  const service = createAdminClient();
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: values.email,
    password: values.password,
    email_confirm: true,
    user_metadata: { full_name: values.fullName },
  });
  if (createError || !created.user) {
    if (createError?.code === "email_exists") return failure(T.emailExists, { email: T.emailExists });
    if (createError?.code === "weak_password") return failure(T.weakPassword, { password: T.weakPassword });
    return failure(LABELS.actions.errors.unexpected);
  }
  const userId = created.user.id;

  const { error: profileError } = await supabase.from("profiles").insert({
    id: userId,
    center_id: profile.centerId,
    full_name: values.fullName,
    role: values.role,
    phone: values.phone ? formatPhone(values.phone) : null,
  });

  let writeError: DatabaseError | null = profileError;
  if (!writeError && values.role === "teacher") {
    const { rows, error } = await assignmentRows(supabase, userId, values.subjectIds);
    writeError = error ?? (await supabase.from("teacher_assignments").insert(rows)).error;
  }
  if (writeError) {
    await service.auth.admin.deleteUser(userId);
    return failure(describeAdminError(writeError));
  }

  revalidateAdmin();
  return success({ email: values.email });
}

export async function updateUser(input: unknown): Promise<ActionResult> {
  const parsed = userUpdateSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  const { supabase } = await admin();
  const { id, fullName, phone, role, subjectIds } = parsed.data;

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, phone: phone ? formatPhone(phone) : null, role })
    .eq("id", id);
  if (error) return failure(describeAdminError(error));

  if (role === "teacher") {
    // Affectations : ajout des nouvelles, retrait de celles décochées.
    const { data: current, error: currentError } = await supabase
      .from("teacher_assignments")
      .select("id, subject_id")
      .eq("teacher_id", id);
    if (currentError) return failure(describeAdminError(currentError));

    const toRemove = current.filter((a) => !subjectIds.includes(a.subject_id)).map((a) => a.id);
    const toAdd = subjectIds.filter((subjectId) => !current.some((a) => a.subject_id === subjectId));

    if (toRemove.length > 0) {
      const { error: removeError } = await supabase.from("teacher_assignments").delete().in("id", toRemove);
      if (removeError) return failure(describeAdminError(removeError));
    }
    if (toAdd.length > 0) {
      const { rows, error: rowsError } = await assignmentRows(supabase, id, toAdd);
      const insertError = rowsError ?? (await supabase.from("teacher_assignments").insert(rows)).error;
      if (insertError) return failure(describeAdminError(insertError));
    }
  }

  revalidateAdmin();
  return success();
}

export async function setUserActive(userId: string, active: boolean): Promise<ActionResult> {
  if (!idSchema.safeParse(userId).success) return failure(LABELS.actions.errors.invalid);
  const { supabase } = await admin();

  // La RLS et le trigger empêchent de se désactiver soi-même.
  const { error } = await supabase.from("profiles").update({ active }).eq("id", userId);
  if (error) return failure(describeAdminError(error));

  // Bloque aussi la connexion et le renouvellement de session côté Auth.
  await createAdminClient().auth.admin.updateUserById(userId, { ban_duration: active ? "none" : "876000h" });

  revalidateAdmin();
  return success();
}

// ---------------------------------------------------------------------
// Élèves
// ---------------------------------------------------------------------
export async function updateStudent(input: unknown): Promise<ActionResult> {
  const parsed = studentUpdateSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  const { supabase } = await admin();
  const { id, fullName, levelId, guardianName, guardianPhone, notes } = parsed.data;

  const { error } = await supabase
    .from("students")
    .update({
      full_name: fullName,
      level_id: levelId,
      guardian_name: guardianName || null,
      guardian_phone: guardianPhone ? formatPhone(guardianPhone) : null,
      notes: notes || null,
    })
    .eq("id", id);
  if (error) return failure(describeAdminError(error));

  revalidateAdmin();
  revalidatePath(ROUTES.assistant.home, "layout");
  return success();
}

export async function deleteStudent(studentId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(studentId).success) return failure(LABELS.actions.errors.invalid);
  const { supabase } = await admin();

  const { data: student } = await supabase.from("students").select("photo_url").eq("id", studentId).maybeSingle();
  const { error } = await supabase.from("students").delete().eq("id", studentId);
  if (error) return failure(describeAdminError(error));
  if (student?.photo_url) await supabase.storage.from(PHOTO_BUCKET).remove([student.photo_url]);

  revalidateAdmin();
  revalidatePath(ROUTES.assistant.home, "layout");
  return success();
}

export async function updateEnrollment(input: unknown): Promise<ActionResult> {
  const parsed = enrollmentUpdateSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  const { supabase } = await admin();
  const { id, priceAgreed, active } = parsed.data;

  const { error } = await supabase.from("enrollments").update({ price_agreed: priceAgreed, active }).eq("id", id);
  if (error) return failure(describeAdminError(error));

  revalidateAdmin();
  revalidatePath(ROUTES.assistant.home, "layout");
  return success();
}

export async function addEnrollment(input: unknown): Promise<ActionResult> {
  const parsed = enrollmentCreateSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  const { supabase } = await admin();

  const { data: subject, error: subjectError } = await supabase
    .from("subjects")
    .select("monthly_price")
    .eq("id", parsed.data.subjectId)
    .maybeSingle();
  if (subjectError) return failure(describeAdminError(subjectError));
  if (!subject) return failure(LABELS.actions.errors.notFound);

  // Une inscription existante (même arrêtée) se reprend : pas de seconde inscription à la même matière.
  const { count, error: existingError } = await supabase
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .eq("student_id", parsed.data.studentId)
    .eq("subject_id", parsed.data.subjectId);
  if (existingError) return failure(describeAdminError(existingError));
  if ((count ?? 0) > 0) return failure(LABELS.admin.students.enrollments.alreadyEnrolled);

  // Prix convenu = tarif de la matière ; la première facture est créée par trigger.
  const { error } = await supabase.from("enrollments").insert({
    student_id: parsed.data.studentId,
    subject_id: parsed.data.subjectId,
    price_agreed: subject.monthly_price,
  });
  if (error) return failure(describeAdminError(error));

  revalidateAdmin();
  revalidatePath(ROUTES.assistant.home, "layout");
  return success();
}
