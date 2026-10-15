"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, failure, success } from "@/lib/actions/result";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole, requireStaff } from "@/lib/auth/session";
import { LOCALES } from "@/lib/i18n/locale";
import { describeCenterError, getLabels } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

const studentSchema = z.object({ studentId: z.uuid(), locale: z.enum(LOCALES).nullable() });

/** Langue des messages d'une famille (vide : langue du centre) ; équipe du centre. */
export async function setStudentMessageLocale(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const parsed = studentSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid);
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_student_message_locale", {
    p_student_id: parsed.data.studentId,
    // Vide : langue du centre (colonne à null).
    p_locale: parsed.data.locale ?? undefined,
  });
  if (error) return failure(await describeCenterError(error));
  revalidatePath(`${ROUTES.admin.students}/${parsed.data.studentId}`);
  revalidatePath(`${ROUTES.assistant.students}/${parsed.data.studentId}`);
  return success();
}

const centerSchema = z.object({ locale: z.enum(LOCALES) });

/** Langue par défaut des familles du centre ; administrateur. */
export async function setCenterFamilyLocale(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const parsed = centerSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid);
  const profile = await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase.from("centers").update({ family_locale: parsed.data.locale }).eq("id", profile.centerId);
  if (error) return failure(await describeCenterError(error));
  revalidatePath(ROUTES.admin.settings);
  return success();
}
