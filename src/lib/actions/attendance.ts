"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, failure, success } from "@/lib/actions/result";
import { getAuthState } from "@/lib/auth/session";
import { describeCenterError, getLabels } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

/** Motif ou note d'une absence (administrateur, assistant, professeur de la matière). */
export async function setAttendanceNote(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const parsed = z
    .object({ attendanceId: z.uuid(), note: z.string().trim().max(300, LABELS.attendanceSheet.noteTooLong) })
    .safeParse(input);
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? LABELS.actions.errors.invalid);
  const state = await getAuthState();
  if (state.status !== "authenticated" || !state.profile.active) return failure(LABELS.actions.errors.forbidden);

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_attendance_note", {
    p_attendance_id: parsed.data.attendanceId,
    p_note: parsed.data.note,
  });
  if (error) return failure(await describeCenterError(error));
  revalidatePath("/", "layout");
  return success();
}
