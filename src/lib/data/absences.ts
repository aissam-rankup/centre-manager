import "server-only";

import { requireRole } from "@/lib/auth/session";
import { signPhotoUrls } from "@/lib/storage/photos";
import { createClient } from "@/lib/supabase/server";

export type AbsenceRow = {
  id: string;
  studentId: string;
  fullName: string;
  photoUrl: string | null;
  levelName: string;
  subjectName: string;
  teacherName: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  /** Série d'absences en cours dans la matière (alerte ouverte), sinon null. */
  streak: number | null;
};

/** Élèves marqués absents à une date donnée (admin, assistant : tout le centre). */
export async function getAbsencesOn(dateIso: string): Promise<AbsenceRow[]> {
  await requireRole(["admin", "assistant"]);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("attendance")
    .select(
      "id, student_id, subject_id, subjects(name), teacher:profiles(full_name), students(full_name, photo_url, guardian_name, guardian_phone, levels(name))",
    )
    .eq("session_date", dateIso)
    .eq("status", "absent");
  if (error) throw error;

  const studentIds = [...new Set(data.map((row) => row.student_id))];
  const alertsResult = studentIds.length
    ? await supabase.from("alerts").select("student_id, payload").eq("type", "consecutive_absences").eq("resolved", false).in("student_id", studentIds)
    : { data: [], error: null };
  if (alertsResult.error) throw alertsResult.error;

  // Série en cours par élève et matière (payload : subject_id, count).
  const streaks = new Map<string, number>();
  for (const alert of alertsResult.data) {
    const payload = alert.payload;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const subjectId = payload.subject_id;
      const count = payload.count;
      if (typeof subjectId === "string" && typeof count === "number") streaks.set(`${alert.student_id}:${subjectId}`, count);
    }
  }

  const photos = await signPhotoUrls(supabase, data.map((row) => row.students?.photo_url));

  return data
    .map((row) => ({
      id: row.id,
      studentId: row.student_id,
      fullName: row.students?.full_name ?? "",
      photoUrl: row.students?.photo_url ? (photos.get(row.students.photo_url) ?? null) : null,
      levelName: row.students?.levels?.name ?? "",
      subjectName: row.subjects?.name ?? "",
      teacherName: row.teacher?.full_name ?? null,
      guardianName: row.students?.guardian_name ?? null,
      guardianPhone: row.students?.guardian_phone ?? null,
      streak: streaks.get(`${row.student_id}:${row.subject_id}`) ?? null,
    }))
    .sort((a, b) => (b.streak ?? 0) - (a.streak ?? 0) || a.fullName.localeCompare(b.fullName, "fr"));
}
