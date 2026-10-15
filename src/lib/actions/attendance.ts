"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, failure, success } from "@/lib/actions/result";
import { ROUTES } from "@/lib/auth/routes";
import { getAuthState, requireRole } from "@/lib/auth/session";
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

const markSessionSchema = z.object({
  slotId: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entries: z
    .array(z.object({ studentId: z.uuid(), status: z.enum(["present", "absent"]) }))
    .min(1)
    .max(200),
});

/**
 * Appel d'une séance par l'accueil (ou l'admin), en secours du professeur.
 * La base vérifie le centre, la date (7 derniers jours), le jour du créneau et
 * l'inscription de chaque élève, et garde l'auteur de chaque saisie.
 */
export async function markSessionAttendance(input: unknown): Promise<ActionResult<number>> {
  const LABELS = await getLabels();
  const parsed = markSessionSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.sessions.roster.nothingToSave);
  await requireRole(["admin", "assistant"]);

  const supabase = await createClient();
  const { slotId, date, entries } = parsed.data;
  const { data, error } = await supabase.rpc("mark_session_attendance", {
    p_slot_id: slotId,
    p_session_date: date,
    p_entries: entries.map((entry) => ({ student_id: entry.studentId, status: entry.status })),
  });
  if (error) return failure(await describeCenterError(error));
  revalidatePath(ROUTES.assistant.sessions, "layout");
  revalidatePath(ROUTES.admin.absences);
  revalidatePath(ROUTES.assistant.absences);
  return success(data);
}

/** L'admin retient un statut pour un appel en désaccord (journalisé comme saisie de l'admin). */
export async function resolveAttendanceConflict(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const parsed = z.object({ conflictId: z.uuid(), status: z.enum(["present", "absent"]) }).safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid);
  await requireRole("admin");

  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_attendance_conflict", {
    p_conflict_id: parsed.data.conflictId,
    p_status: parsed.data.status,
  });
  if (error) return failure(await describeCenterError(error));
  revalidatePath(ROUTES.admin.home, "layout");
  return success();
}
