import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { LABELS } from "@/lib/constants/labels";
import { toISODate, today } from "@/lib/format";
import { signPhotoUrls } from "@/lib/storage/photos";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Données communes aux tableaux de bord Admin et Assistant.
 * Lues sous la RLS de l'utilisateur (admin ou assistant : tout son centre).
 */

export type DashboardStudentStatus = "upToDate" | "overdue" | "followedUp";

export type DashboardStudent = {
  id: string;
  fullName: string;
  photoUrl: string | null;
  levelName: string;
  /** Matières suivies, ou « Pack … ». */
  subjects: string;
  status: DashboardStudentStatus;
  guardianPhone: string | null;
};

export type SubjectPresence = {
  subjectId: string;
  subjectName: string;
  levelName: string;
  /** Taux de présence : 1 − taux d'absence. */
  rate: number;
  students: number;
};

type Client = SupabaseClient<Database>;

const STATUS_ORDER: Record<DashboardStudentStatus, number> = { overdue: 0, followedUp: 1, upToDate: 2 };

/** Élèves (niveau éventuellement filtré), retards d'abord, et nombre de relances à faire aujourd'hui. */
export async function loadDashboardStudents(
  supabase: Client,
  levelId: string | null = null,
): Promise<{ students: DashboardStudent[]; followUpsToday: number }> {
  let directoryQuery = supabase
    .from("student_directory")
    .select("id, full_name, level_id, level_name, photo_url, guardian_phone, is_overdue")
    .order("full_name");
  if (levelId) directoryQuery = directoryQuery.eq("level_id", levelId);

  const [directoryResult, enrollmentsResult, packsResult, queueResult] = await Promise.all([
    directoryQuery,
    supabase.from("enrollments").select("student_id, pack_enrollment_id, subjects(name)").eq("active", true),
    supabase.from("pack_enrollments").select("student_id, packs(name)").eq("active", true),
    supabase.from("follow_up_queue").select("student_id, oldest_due_date, last_follow_up_at, followed_up_today"),
  ]);
  if (directoryResult.error) throw directoryResult.error;
  if (enrollmentsResult.error) throw enrollmentsResult.error;
  if (packsResult.error) throw packsResult.error;
  if (queueResult.error) throw queueResult.error;

  // Matières suivies : le pack prime sur le détail de ses matières.
  const subjectsByStudent = new Map<string, string[]>();
  for (const row of enrollmentsResult.data) {
    if (row.pack_enrollment_id || !row.subjects?.name) continue;
    subjectsByStudent.set(row.student_id, [...(subjectsByStudent.get(row.student_id) ?? []), row.subjects.name]);
  }
  const packByStudent = new Map(packsResult.data.map((row) => [row.student_id, row.packs?.name ?? ""] as const));
  const queue = new Map(queueResult.data.flatMap((row) => (row.student_id ? [[row.student_id, row] as const] : [])));

  const photos = await signPhotoUrls(supabase, directoryResult.data.map((row) => row.photo_url));
  const students: DashboardStudent[] = directoryResult.data
    .flatMap((row) => {
      if (!row.id || !row.full_name) return [];
      const pending = queue.get(row.id);
      // « Relance faite » : une relance de paiement a eu lieu depuis l'échéance la plus ancienne.
      const followedUp = Boolean(
        pending?.last_follow_up_at &&
          pending.oldest_due_date &&
          pending.last_follow_up_at.slice(0, 10) >= pending.oldest_due_date,
      );
      const status: DashboardStudentStatus = !row.is_overdue ? "upToDate" : followedUp ? "followedUp" : "overdue";
      const pack = packByStudent.get(row.id);
      return [
        {
          id: row.id,
          fullName: row.full_name,
          photoUrl: row.photo_url ? (photos.get(row.photo_url) ?? null) : null,
          levelName: row.level_name ?? "",
          subjects: pack
            ? LABELS.packs.label(pack)
            : (subjectsByStudent.get(row.id) ?? []).sort((a, b) => a.localeCompare(b, "fr")).join(", "),
          status,
          guardianPhone: row.guardian_phone,
        },
      ];
    })
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.fullName.localeCompare(b.fullName, "fr"));

  const studentIds = new Set(students.map((student) => student.id));
  const followUpsToday = queueResult.data.filter(
    (row) => row.student_id && studentIds.has(row.student_id) && !row.followed_up_today,
  ).length;

  return { students, followUpsToday };
}

/**
 * Présence par matière sur les derniers jours, calculée à partir des appels
 * lisibles par l'utilisateur ; du plus faible au plus fort taux.
 */
export async function loadSubjectPresence(supabase: Client, days = 30): Promise<SubjectPresence[]> {
  const since = new Date(today());
  since.setDate(since.getDate() - days);

  const [attendanceResult, subjectsResult, enrollmentsResult] = await Promise.all([
    supabase.from("attendance").select("subject_id, status").gte("session_date", toISODate(since)),
    supabase.from("subjects").select("id, name, levels(name)"),
    supabase.from("enrollments").select("subject_id").eq("active", true),
  ]);
  if (attendanceResult.error) throw attendanceResult.error;
  if (subjectsResult.error) throw subjectsResult.error;
  if (enrollmentsResult.error) throw enrollmentsResult.error;

  const totals = new Map<string, { present: number; total: number }>();
  for (const row of attendanceResult.data) {
    const entry = totals.get(row.subject_id) ?? { present: 0, total: 0 };
    entry.total += 1;
    if (row.status === "present") entry.present += 1;
    totals.set(row.subject_id, entry);
  }
  const enrolled = new Map<string, number>();
  for (const row of enrollmentsResult.data) enrolled.set(row.subject_id, (enrolled.get(row.subject_id) ?? 0) + 1);

  return subjectsResult.data
    .flatMap((subject) => {
      const entry = totals.get(subject.id);
      if (!entry || entry.total === 0) return [];
      return [
        {
          subjectId: subject.id,
          subjectName: subject.name,
          levelName: subject.levels?.name ?? "",
          rate: entry.present / entry.total,
          students: enrolled.get(subject.id) ?? 0,
        },
      ];
    })
    .sort((a, b) => a.rate - b.rate || a.subjectName.localeCompare(b.subjectName, "fr"));
}
