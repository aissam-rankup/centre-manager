"use server";

import { revalidatePath } from "next/cache";

import { type ActionResult, describeDatabaseError, failure, success } from "@/lib/actions/result";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole } from "@/lib/auth/session";
import { LABELS } from "@/lib/constants/labels";
import { todayDayOfWeek } from "@/lib/data/teacher";
import { toISODate, today } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { attendanceSchema } from "@/lib/validation/teacher";

/**
 * Enregistre (ou corrige) l'appel du jour d'une séance.
 * La RLS garantit en plus : matière du professeur, élève inscrit, date du jour.
 */
export async function saveAttendance(input: unknown): Promise<ActionResult> {
  const parsed = attendanceSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid);

  const profile = await requireRole("teacher");
  const supabase = await createClient();
  const { slotId, entries } = parsed.data;

  // Créneau du professeur (la RLS ne renvoie que ses propres créneaux).
  const { data: slot, error: slotError } = await supabase
    .from("schedule_slots")
    .select("id, subject_id, day_of_week")
    .eq("id", slotId)
    .maybeSingle();
  if (slotError) return failure(describeDatabaseError(slotError));
  if (!slot) return failure(LABELS.actions.errors.notFound);
  if (slot.day_of_week !== todayDayOfWeek()) return failure(LABELS.teacher.call.errors.notToday);

  const sessionDate = toISODate(today());
  const { error } = await supabase.from("attendance").upsert(
    entries.map((entry) => ({
      student_id: entry.studentId,
      subject_id: slot.subject_id,
      teacher_id: profile.id,
      session_date: sessionDate,
      status: entry.status,
    })),
    { onConflict: "student_id,subject_id,session_date" },
  );
  if (error) return failure(describeDatabaseError(error));

  revalidatePath(ROUTES.teacher.home, "layout");
  revalidatePath(ROUTES.assistant.home);
  return success();
}
