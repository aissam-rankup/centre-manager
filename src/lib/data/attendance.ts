import "server-only";

import type { NotificationChannel } from "@/lib/absences";
import type { AttendanceRecord } from "@/lib/attendance";
import { createClient } from "@/lib/supabase/server";

export type AbsenceFollowUp = {
  id: string;
  createdAt: string;
  channel: "phone" | "whatsapp" | "in_person";
  note: string | null;
  authorName: string | null;
};

export type AttendanceStudent = {
  id: string;
  fullName: string;
  levelName: string;
  guardianName: string | null;
  guardianPhone: string | null;
};

/** Dernière notification au responsable d'une séance manquée (accueil et admin). */
export type AbsenceNotice = { sentAt: string; channel: NotificationChannel; byName: string | null };

export type AttendanceData = {
  student: AttendanceStudent | null;
  records: AttendanceRecord[];
  /** Administrateur et assistant uniquement (vide pour un professeur). */
  followUps: AbsenceFollowUp[];
  /** Par séance (identifiant de présence) ; vide pour un professeur. */
  notices: Record<string, AbsenceNotice>;
};

/**
 * Assiduité d'un élève, filtrée en base selon le compte connecté :
 * administrateur et assistant voient toutes ses matières, un professeur
 * uniquement celles qu'il enseigne.
 */
export async function getAttendanceData(studentId: string): Promise<AttendanceData> {
  const supabase = await createClient();
  const [student, records, followUps, notices] = await Promise.all([
    supabase.from("students").select("id, full_name, guardian_name, guardian_phone, levels(name)").eq("id", studentId).maybeSingle(),
    supabase.rpc("student_attendance", { p_student_id: studentId }),
    supabase.rpc("student_absence_follow_ups", { p_student_id: studentId }),
    supabase
      .from("absence_notifications")
      .select("attendance_id, sent_at, channel, profiles(full_name)")
      .eq("student_id", studentId)
      .eq("status", "sent")
      .order("sent_at", { ascending: true }),
  ]);
  if (student.error) throw student.error;
  if (records.error) throw records.error;
  if (followUps.error) throw followUps.error;
  if (notices.error) throw notices.error;

  return {
    student: student.data
      ? {
          id: student.data.id,
          fullName: student.data.full_name,
          levelName: student.data.levels?.name ?? "",
          guardianName: student.data.guardian_name,
          guardianPhone: student.data.guardian_phone,
        }
      : null,
    records: records.data.map((row) => ({
      id: row.attendance_id,
      date: row.session_date,
      status: row.status,
      subjectId: row.subject_id,
      subjectName: row.subject_name,
      levelName: row.level_name,
      teacherName: row.teacher_name,
      startTime: row.start_time ? row.start_time.slice(0, 5) : null,
      endTime: row.end_time ? row.end_time.slice(0, 5) : null,
      note: row.note,
    })),
    followUps: followUps.data.map((row) => ({
      id: row.follow_up_id,
      createdAt: row.created_at,
      channel: row.channel,
      note: row.note,
      authorName: row.author_name,
    })),
    // Ordre croissant : la dernière notification de chaque séance l'emporte.
    notices: Object.fromEntries(
      notices.data.flatMap((row) =>
        row.attendance_id
          ? [[row.attendance_id, { sentAt: row.sent_at, channel: row.channel, byName: row.profiles?.full_name ?? null }] as const]
          : [],
      ),
    ),
  };
}
