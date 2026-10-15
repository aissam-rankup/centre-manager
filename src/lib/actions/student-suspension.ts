"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, failure, success } from "@/lib/actions/result";
import { ROUTES } from "@/lib/auth/routes";
import { requireStaff } from "@/lib/auth/session";
import { describeCenterError, getLabels } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

function revalidateStudents() {
  revalidatePath(ROUTES.admin.home, "layout");
  revalidatePath(ROUTES.assistant.home, "layout");
  revalidatePath(ROUTES.teacher.home, "layout");
}

const suspendSchema = z.object({ studentId: z.uuid(), reason: z.string().trim().min(1).max(200) });

/** Suspension (admin ou assistant du centre) : motif court obligatoire. */
export async function suspendStudent(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const S = LABELS.assistant.student.suspension;
  const parsed = suspendSchema.safeParse(input);
  if (!parsed.success) return failure(S.reasonRequired, { reason: S.reasonRequired });
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase.rpc("suspend_student", { p_student_id: parsed.data.studentId, p_reason: parsed.data.reason });
  if (error) return failure(await describeCenterError(error));
  revalidateStudents();
  return success();
}

/** Réactivation : de nouveau partout, facture du mois en cours émise. */
export async function reactivateStudent(studentId: string): Promise<ActionResult> {
  const LABELS = await getLabels();
  if (!z.uuid().safeParse(studentId).success) return failure(LABELS.actions.errors.invalid);
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase.rpc("reactivate_student", { p_student_id: studentId });
  if (error) return failure(await describeCenterError(error));
  revalidateStudents();
  return success();
}
