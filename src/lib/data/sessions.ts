import "server-only";

import type { AttendanceMarker } from "@/lib/attendance";
import { requireRole } from "@/lib/auth/session";
import { formatTime, today, toISODate } from "@/lib/format";
import { signPhotoUrls } from "@/lib/storage/photos";
import { createClient } from "@/lib/supabase/server";

/** Jours en arrière où l'accueil peut encore faire ou corriger un appel (vérifié aussi en base). */
export const SESSION_DAYS_BACK = 7;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** « 2026-10-04 » décalé de n jours (calendrier, sans fuseau). */
export function shiftIsoDate(iso: string, days: number): string {
  const [year = 0, month = 1, day = 1] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Fenêtre des appels possibles : des 7 derniers jours à aujourd'hui. */
export function sessionWindow(): { min: string; max: string } {
  const max = toISODate(today());
  return { min: shiftIsoDate(max, -SESSION_DAYS_BACK), max };
}

/** Date demandée si elle est dans la fenêtre, sinon aujourd'hui. */
export function parseSessionDate(value: unknown): string {
  const { min, max } = sessionWindow();
  return typeof value === "string" && ISO_DATE.test(value) && value >= min && value <= max ? value : max;
}

export type SessionState = "upcoming" | "ongoing" | "done";

export type DaySession = {
  slotId: string;
  subjectId: string;
  subjectName: string;
  levelName: string;
  teacherName: string | null;
  room: string;
  /** « 17:00 » */
  startTime: string;
  endTime: string;
  studentCount: number;
  markedCount: number;
  absentCount: number;
  teacherMarked: number;
  staffMarked: number;
  lastMarkedAt: string | null;
  openConflicts: number;
  state: SessionState;
};

/** État d'une séance à l'heure de Casablanca (les jours passés sont terminés). */
function sessionState(dateIso: string, start: string, end: string): SessionState {
  const todayIso = toISODate(today());
  if (dateIso < todayIso) return "done";
  const now = formatTime(new Date());
  if (now < start) return "upcoming";
  return now < end ? "ongoing" : "done";
}

/** Séances d'un jour du centre, avec l'avancement de l'appel (accueil et admin). */
export async function getDaySessions(dateIso: string): Promise<DaySession[]> {
  await requireRole(["admin", "assistant"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_day_sessions", { p_date: dateIso });
  if (error) throw error;
  return data.map((row) => {
    const startTime = row.start_time.slice(0, 5);
    const endTime = row.end_time.slice(0, 5);
    return {
      slotId: row.slot_id,
      subjectId: row.subject_id,
      subjectName: row.subject_name,
      levelName: row.level_name,
      teacherName: row.teacher_name,
      room: row.room,
      startTime,
      endTime,
      studentCount: row.student_count,
      markedCount: row.marked_count,
      absentCount: row.absent_count,
      teacherMarked: row.teacher_marked,
      staffMarked: row.staff_marked,
      lastMarkedAt: row.last_marked_at,
      openConflicts: row.open_conflicts,
      state: sessionState(dateIso, startTime, endTime),
    };
  });
}

export type RosterStudent = {
  id: string;
  fullName: string;
  photoUrl: string | null;
  status: "present" | "absent" | null;
  markedByName: string | null;
  markedByRole: AttendanceMarker | null;
  markedAt: string | null;
};

export type SessionRoster = {
  session: DaySession;
  date: string;
  students: RosterStudent[];
};

/** Élèves inscrits à une séance à cette date, et leur statut actuel (avec l'auteur de la saisie). */
export async function getSessionRoster(slotId: string, dateIso: string): Promise<SessionRoster | null> {
  const session = (await getDaySessions(dateIso)).find((item) => item.slotId === slotId);
  if (!session) return null;
  const supabase = await createClient();

  const [enrollmentsResult, attendanceResult] = await Promise.all([
    supabase
      .from("enrollments")
      .select("student_id, students(full_name, photo_url)")
      .eq("subject_id", session.subjectId)
      .eq("active", true)
      .lte("start_date", dateIso),
    supabase
      .from("attendance")
      .select("student_id, status, marked_by_role, marked_at, marker:profiles!attendance_marked_by_fkey(full_name)")
      .eq("subject_id", session.subjectId)
      .eq("session_date", dateIso),
  ]);
  if (enrollmentsResult.error) throw enrollmentsResult.error;
  if (attendanceResult.error) throw attendanceResult.error;

  const marks = new Map(attendanceResult.data.map((row) => [row.student_id, row] as const));
  const enrolled = [...new Map(enrollmentsResult.data.map((row) => [row.student_id, row] as const)).values()];
  const photos = await signPhotoUrls(supabase, enrolled.map((row) => row.students?.photo_url));

  return {
    session,
    date: dateIso,
    students: enrolled
      .map((row) => {
        const mark = marks.get(row.student_id);
        const photo = row.students?.photo_url;
        return {
          id: row.student_id,
          fullName: row.students?.full_name ?? "",
          photoUrl: photo ? (photos.get(photo) ?? null) : null,
          status: mark?.status ?? null,
          markedByName: mark?.marker?.full_name ?? null,
          markedByRole: mark?.marked_by_role ?? null,
          markedAt: mark?.marked_at ?? null,
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "fr")),
  };
}

export type AttendanceConflict = {
  id: string;
  studentId: string;
  studentName: string;
  subjectName: string;
  levelName: string;
  sessionDate: string;
  currentStatus: "present" | "absent";
  teacher: { status: "present" | "absent"; name: string | null; at: string };
  staff: { status: "present" | "absent"; name: string | null; role: AttendanceMarker | null; at: string };
  detectedAt: string;
};

/** Appels en désaccord professeur / accueil, à trancher par l'admin. */
export async function getOpenAttendanceConflicts(): Promise<AttendanceConflict[]> {
  const profile = await requireRole("admin");
  if (profile.support) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_attendance_conflicts");
  if (error) throw error;
  return data.map((row) => ({
    id: row.conflict_id,
    studentId: row.student_id,
    studentName: row.student_name,
    subjectName: row.subject_name,
    levelName: row.level_name,
    sessionDate: row.session_date,
    currentStatus: row.current_status,
    teacher: { status: row.teacher_status, name: row.teacher_name, at: row.teacher_marked_at },
    staff: { status: row.staff_status, name: row.staff_name, role: row.staff_role, at: row.staff_marked_at },
    detectedAt: row.detected_at,
  }));
}
