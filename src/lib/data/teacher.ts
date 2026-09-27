import "server-only";

import { requireRole } from "@/lib/auth/session";
import { toISODate, today } from "@/lib/format";
import { signPhotoUrls } from "@/lib/storage/photos";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type AttendanceStatus = Database["public"]["Enums"]["attendance_status"];

export type TeacherSlot = {
  id: string;
  subjectId: string;
  subjectName: string;
  levelName: string;
  dayOfWeek: number;
  /** « 17:00 » */
  startTime: string;
  endTime: string;
  room: string;
};

/** « 17:00:00 » → « 17:00 » */
function shortTime(value: string): string {
  return value.slice(0, 5);
}

/** Jour de la semaine à Casablanca (0 = dimanche). */
export function todayDayOfWeek(): number {
  return today().getDay();
}

/**
 * Créneaux du professeur connecté (la RLS ne renvoie que les siens),
 * avec les noms de matière (vue sans tarif) et de niveau.
 */
export async function getTeacherSlots(): Promise<TeacherSlot[]> {
  await requireRole("teacher");
  const supabase = await createClient();

  const [slotsResult, subjectsResult, levelsResult] = await Promise.all([
    supabase
      .from("schedule_slots")
      .select("id, subject_id, level_id, day_of_week, start_time, end_time, room")
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true }),
    supabase.from("subject_catalog").select("id, name"),
    supabase.from("levels").select("id, name"),
  ]);
  if (slotsResult.error) throw slotsResult.error;
  if (subjectsResult.error) throw subjectsResult.error;
  if (levelsResult.error) throw levelsResult.error;

  const subjects = new Map(subjectsResult.data.flatMap((s) => (s.id && s.name ? [[s.id, s.name] as const] : [])));
  const levels = new Map(levelsResult.data.map((l) => [l.id, l.name] as const));

  return slotsResult.data.map((slot) => ({
    id: slot.id,
    subjectId: slot.subject_id,
    subjectName: subjects.get(slot.subject_id) ?? "",
    levelName: levels.get(slot.level_id) ?? "",
    dayOfWeek: slot.day_of_week,
    startTime: shortTime(slot.start_time),
    endTime: shortTime(slot.end_time),
    room: slot.room,
  }));
}

// ---------------------------------------------------------------------
// Accueil : séances du jour
// ---------------------------------------------------------------------
export type TodaySession = TeacherSlot & {
  studentCount: number;
  markedCount: number;
};

export async function getTodaySessions(): Promise<TodaySession[]> {
  const slots = (await getTeacherSlots()).filter((slot) => slot.dayOfWeek === todayDayOfWeek());
  if (slots.length === 0) return [];

  const supabase = await createClient();
  const subjectIds = [...new Set(slots.map((slot) => slot.subjectId))];

  const [rostersResult, attendanceResult] = await Promise.all([
    supabase.from("class_rosters").select("student_id, subject_id").in("subject_id", subjectIds).eq("active", true),
    supabase
      .from("attendance")
      .select("student_id, subject_id")
      .in("subject_id", subjectIds)
      .eq("session_date", toISODate(today())),
  ]);
  if (rostersResult.error) throw rostersResult.error;
  if (attendanceResult.error) throw attendanceResult.error;

  const countBy = (rows: { subject_id: string | null }[]) => {
    const counts = new Map<string, number>();
    for (const row of rows) if (row.subject_id) counts.set(row.subject_id, (counts.get(row.subject_id) ?? 0) + 1);
    return counts;
  };
  const rosterCounts = countBy(rostersResult.data);
  const markedCounts = countBy(attendanceResult.data);

  return slots.map((slot) => ({
    ...slot,
    studentCount: rosterCounts.get(slot.subjectId) ?? 0,
    markedCount: markedCounts.get(slot.subjectId) ?? 0,
  }));
}

// ---------------------------------------------------------------------
// Tableau de bord
// ---------------------------------------------------------------------
export type TeacherStudentRow = {
  /** Élève × matière. */
  key: string;
  studentId: string;
  fullName: string;
  photoUrl: string | null;
  levelName: string;
  subjectName: string;
  /** Statut à la dernière séance saisie, ou null si aucun appel. */
  lastStatus: AttendanceStatus | null;
};

export type TeacherDashboard = {
  sessions: TodaySession[];
  students: TeacherStudentRow[];
  studentCount: number;
  subjectCount: number;
  /** Présence sur 30 jours (0 à 1), ou null sans appel. */
  presenceRate: number | null;
};

export async function getTeacherDashboard(): Promise<TeacherDashboard> {
  const [sessions, slots] = await Promise.all([getTodaySessions(), getTeacherSlots()]);
  const supabase = await createClient();

  const since = new Date(today());
  since.setDate(since.getDate() - 30);

  // La RLS limite les listes de classe, présences et élèves aux matières du professeur.
  const [rostersResult, catalogResult, attendanceResult] = await Promise.all([
    supabase.from("class_rosters").select("student_id, subject_id").eq("active", true),
    supabase.from("subject_catalog").select("id, name"),
    supabase.from("attendance").select("student_id, subject_id, session_date, status").order("session_date", { ascending: false }),
  ]);
  if (rostersResult.error) throw rostersResult.error;
  if (catalogResult.error) throw catalogResult.error;
  if (attendanceResult.error) throw attendanceResult.error;

  const mySubjects = new Set(slots.map((slot) => slot.subjectId));
  const rosters = rostersResult.data.filter(
    (row): row is { student_id: string; subject_id: string } =>
      Boolean(row.student_id && row.subject_id && mySubjects.has(row.subject_id)),
  );
  const studentIds = [...new Set(rosters.map((row) => row.student_id))];

  const studentsResult = studentIds.length
    ? await supabase.from("students").select("id, full_name, photo_url, levels(name)").in("id", studentIds)
    : { data: [], error: null };
  if (studentsResult.error) throw studentsResult.error;

  const subjectNames = new Map(catalogResult.data.flatMap((s) => (s.id && s.name ? [[s.id, s.name] as const] : [])));
  const students = new Map(studentsResult.data.map((s) => [s.id, s] as const));
  const photos = await signPhotoUrls(supabase, studentsResult.data.map((s) => s.photo_url));

  // Dernier statut par élève et matière (présences triées de la plus récente à la plus ancienne).
  const lastStatus = new Map<string, AttendanceStatus>();
  let present = 0;
  let recorded = 0;
  const sinceIso = toISODate(since);
  for (const row of attendanceResult.data) {
    if (!mySubjects.has(row.subject_id)) continue;
    const key = `${row.student_id}:${row.subject_id}`;
    if (!lastStatus.has(key)) lastStatus.set(key, row.status);
    if (row.session_date >= sinceIso) {
      recorded += 1;
      if (row.status === "present") present += 1;
    }
  }

  const rows: TeacherStudentRow[] = rosters
    .flatMap((row) => {
      const student = students.get(row.student_id);
      if (!student) return [];
      const key = `${row.student_id}:${row.subject_id}`;
      return [
        {
          key,
          studentId: row.student_id,
          fullName: student.full_name,
          photoUrl: student.photo_url ? (photos.get(student.photo_url) ?? null) : null,
          levelName: student.levels?.name ?? "",
          subjectName: subjectNames.get(row.subject_id) ?? "",
          lastStatus: lastStatus.get(key) ?? null,
        },
      ];
    })
    // Absents d'abord, puis par nom.
    .sort(
      (a, b) =>
        Number(b.lastStatus === "absent") - Number(a.lastStatus === "absent") ||
        a.fullName.localeCompare(b.fullName, "fr"),
    );

  return {
    sessions,
    students: rows,
    studentCount: studentIds.length,
    subjectCount: mySubjects.size,
    presenceRate: recorded > 0 ? present / recorded : null,
  };
}

// ---------------------------------------------------------------------
// Mode appel
// ---------------------------------------------------------------------
export type CallStudent = {
  id: string;
  fullName: string;
  photoUrl: string | null;
  /** Statut déjà enregistré aujourd'hui, le cas échéant. */
  status: AttendanceStatus | null;
};

export type CallSheet = {
  slot: TeacherSlot;
  isToday: boolean;
  students: CallStudent[];
};

export async function getCallSheet(slotId: string): Promise<CallSheet | null> {
  const slot = (await getTeacherSlots()).find((item) => item.id === slotId);
  if (!slot) return null;

  const isToday = slot.dayOfWeek === todayDayOfWeek();
  const supabase = await createClient();

  const { data: roster, error: rosterError } = await supabase
    .from("class_rosters")
    .select("student_id")
    .eq("subject_id", slot.subjectId)
    .eq("active", true);
  if (rosterError) throw rosterError;

  const studentIds = [...new Set(roster.flatMap((row) => (row.student_id ? [row.student_id] : [])))];
  if (studentIds.length === 0) return { slot, isToday, students: [] };

  const [studentsResult, attendanceResult] = await Promise.all([
    supabase.from("students").select("id, full_name, photo_url").in("id", studentIds).order("full_name"),
    supabase
      .from("attendance")
      .select("student_id, status")
      .eq("subject_id", slot.subjectId)
      .eq("session_date", toISODate(today())),
  ]);
  if (studentsResult.error) throw studentsResult.error;
  if (attendanceResult.error) throw attendanceResult.error;

  const statuses = new Map(attendanceResult.data.map((row) => [row.student_id, row.status] as const));
  const photos = await signPhotoUrls(supabase, studentsResult.data.map((student) => student.photo_url));

  return {
    slot,
    isToday,
    students: studentsResult.data.map((student) => ({
      id: student.id,
      fullName: student.full_name,
      photoUrl: student.photo_url ? (photos.get(student.photo_url) ?? null) : null,
      status: isToday ? (statuses.get(student.id) ?? null) : null,
    })),
  };
}
