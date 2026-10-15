"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, failure, success } from "@/lib/actions/result";
import { ROUTES } from "@/lib/auth/routes";
import { requireStaff } from "@/lib/auth/session";
import { describeCenterError, getLabels } from "@/lib/i18n/server";
import {
  createStudentAccess,
  setStudentAccessActive,
  type StudentCredentials,
} from "@/lib/student-accounts";

const studentIdSchema = z.object({ studentId: z.uuid() });

function revalidateStudent(studentId: string) {
  revalidatePath(`${ROUTES.assistant.students}/${studentId}`);
  revalidatePath(`${ROUTES.admin.students}/${studentId}`);
}

/** Ouvre l'accès élève (plateforme pédagogique) : identifiants affichés une fois. */
export async function openStudentAccess(input: unknown): Promise<ActionResult<StudentCredentials>> {
  const LABELS = await getLabels();
  const parsed = studentIdSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid);
  const profile = await requireStaff();
  if (profile.support) return failure(LABELS.actions.errors.forbidden);
  if (!profile.modules.includes("lms")) return failure(LABELS.actions.errors.moduleDisabled);

  const result = await createStudentAccess(parsed.data.studentId);
  if (!result.ok) return failure(result.error ? await describeCenterError(result.error) : LABELS.studentAccess.failed);
  revalidateStudent(parsed.data.studentId);
  return success(result.credentials);
}

/** Désactive (l'élève quitte le centre) ou réactive l'accès, sans rien supprimer. */
export async function setStudentAccess(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const parsed = studentIdSchema.extend({ active: z.boolean() }).safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid);
  const profile = await requireStaff();
  if (profile.support) return failure(LABELS.actions.errors.forbidden);

  const error = await setStudentAccessActive(parsed.data.studentId, parsed.data.active);
  if (error) return failure(await describeCenterError(error));
  revalidateStudent(parsed.data.studentId);
  return success();
}
