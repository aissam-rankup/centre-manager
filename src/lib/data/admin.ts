import "server-only";

import { requireRole } from "@/lib/auth/session";
import { signPhotoUrls, STAFF_PHOTO_BUCKET } from "@/lib/storage/photos";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type UserRole = Database["public"]["Enums"]["user_role"];

/** Toutes les données de cet espace sont réservées à l'administrateur. */
async function adminClient() {
  const profile = await requireRole("admin");
  return { profile, supabase: await createClient() };
}

// ---------------------------------------------------------------------
// Référentiel
// ---------------------------------------------------------------------
export type LevelOption = { id: string; name: string };

export async function getLevelOptions(): Promise<LevelOption[]> {
  const { supabase } = await adminClient();
  const { data, error } = await supabase.from("levels").select("id, name").order("sort_order").order("name");
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------
// Tableau de bord
// ---------------------------------------------------------------------
export type AbsenceRate = {
  subjectId: string;
  subjectName: string;
  levelName: string;
  absentCount: number;
  totalCount: number;
  rate: number;
};

export type AdminDashboard = {
  monthStart: string;
  expected: number;
  collected: number;
  invoiceCount: number;
  paidCount: number;
  studentCount: number;
  absenceRates: AbsenceRate[];
  levels: LevelOption[];
};

function mapRates(
  rows: Database["public"]["Functions"]["admin_absence_rates"]["Returns"],
): AbsenceRate[] {
  return rows
    .map((row) => ({
      subjectId: row.subject_id,
      subjectName: row.subject_name,
      levelName: row.level_name,
      absentCount: row.absent_count,
      totalCount: row.total_count,
      rate: Number(row.absence_rate),
    }))
    .sort((a, b) => b.rate - a.rate || a.subjectName.localeCompare(b.subjectName, "fr"));
}

export async function getAdminDashboard(levelId: string | null): Promise<AdminDashboard> {
  const { supabase } = await adminClient();
  const level = levelId ?? undefined;

  const [revenueResult, ratesResult, levels] = await Promise.all([
    supabase.rpc("admin_month_revenue", { p_level_id: level }).single(),
    supabase.rpc("admin_absence_rates", { p_level_id: level, p_days: 30 }),
    getLevelOptions(),
  ]);
  if (revenueResult.error) throw revenueResult.error;
  if (ratesResult.error) throw ratesResult.error;

  const revenue = revenueResult.data;
  return {
    monthStart: revenue.month_start,
    expected: Number(revenue.expected_amount),
    collected: Number(revenue.collected_amount),
    invoiceCount: revenue.invoice_count,
    paidCount: revenue.paid_count,
    studentCount: revenue.student_count,
    absenceRates: mapRates(ratesResult.data).filter((rate) => rate.totalCount > 0),
    levels,
  };
}

// ---------------------------------------------------------------------
// Niveaux et matières
// ---------------------------------------------------------------------
export type AdminSubject = { id: string; name: string; monthlyPrice: number; activeEnrollments: number };
export type AdminPack = {
  id: string;
  name: string;
  monthlyPrice: number;
  active: boolean;
  subscribers: number;
  subjectIds: string[];
};
export type AdminLevel = {
  id: string;
  name: string;
  sortOrder: number;
  studentCount: number;
  subjects: AdminSubject[];
  packs: AdminPack[];
};

export async function getLevelsWithStats(): Promise<AdminLevel[]> {
  const { supabase } = await adminClient();
  const [reportResult, packsResult, packSubjectsResult] = await Promise.all([
    supabase.rpc("admin_enrollment_report"),
    supabase.rpc("admin_pack_report"),
    supabase.from("pack_subjects").select("pack_id, subject_id"),
  ]);
  if (reportResult.error) throw reportResult.error;
  if (packsResult.error) throw packsResult.error;
  if (packSubjectsResult.error) throw packSubjectsResult.error;
  const data = reportResult.data;

  const subjectsByPack = new Map<string, string[]>();
  for (const row of packSubjectsResult.data) {
    subjectsByPack.set(row.pack_id, [...(subjectsByPack.get(row.pack_id) ?? []), row.subject_id]);
  }

  const levels = new Map<string, AdminLevel>();
  for (const row of data) {
    const level = levels.get(row.level_id) ?? {
      id: row.level_id,
      name: row.level_name,
      sortOrder: row.level_sort,
      studentCount: row.level_students,
      subjects: [],
      packs: packsResult.data
        .filter((pack) => pack.level_id === row.level_id)
        .map((pack) => ({
          id: pack.pack_id,
          name: pack.pack_name,
          monthlyPrice: Number(pack.monthly_price),
          active: pack.active,
          subscribers: pack.subscribers,
          subjectIds: subjectsByPack.get(pack.pack_id) ?? [],
        })),
    };
    if (row.subject_id && row.subject_name) {
      level.subjects.push({
        id: row.subject_id,
        name: row.subject_name,
        monthlyPrice: Number(row.monthly_price ?? 0),
        activeEnrollments: row.active_enrollments ?? 0,
      });
    }
    levels.set(row.level_id, level);
  }
  return [...levels.values()];
}

// ---------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------
export type PlanningSlot = {
  id: string;
  subjectId: string;
  subjectName: string;
  levelId: string;
  levelName: string;
  teacherId: string;
  teacherName: string;
  /** URL signée de la photo du professeur, si elle existe. */
  teacherPhotoUrl: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string;
};

export type PlanningSubject = { id: string; name: string; levelId: string; levelName: string; teacherIds: string[] };
export type PlanningTeacher = { id: string; fullName: string };

export type PlanningData = {
  slots: PlanningSlot[];
  subjects: PlanningSubject[];
  teachers: PlanningTeacher[];
  levels: LevelOption[];
};

export async function getPlanningData(): Promise<PlanningData> {
  const { supabase } = await adminClient();

  const [slotsResult, subjectsResult, teachersResult, assignmentsResult] = await Promise.all([
    supabase
      .from("schedule_slots")
      .select("id, subject_id, level_id, teacher_id, day_of_week, start_time, end_time, room")
      .order("day_of_week")
      .order("start_time"),
    supabase.from("subjects").select("id, name, level_id, levels(name, sort_order)"),
    supabase.from("profiles").select("id, full_name, active, photo_url").eq("role", "teacher").order("full_name"),
    supabase.from("teacher_assignments").select("teacher_id, subject_id"),
  ]);
  for (const result of [slotsResult, subjectsResult, teachersResult, assignmentsResult]) {
    if (result.error) throw result.error;
  }

  const teacherNames = new Map((teachersResult.data ?? []).map((t) => [t.id, t.full_name] as const));
  const teacherPhotoPaths = new Map((teachersResult.data ?? []).map((t) => [t.id, t.photo_url] as const));
  const teacherPhotos = await signPhotoUrls(supabase, [...teacherPhotoPaths.values()], STAFF_PHOTO_BUCKET);
  const assignments = new Map<string, string[]>();
  for (const row of assignmentsResult.data ?? []) {
    assignments.set(row.subject_id, [...(assignments.get(row.subject_id) ?? []), row.teacher_id]);
  }

  const activeTeachers = new Set((teachersResult.data ?? []).filter((t) => t.active).map((t) => t.id));
  const subjects: PlanningSubject[] = [...(subjectsResult.data ?? [])]
    .sort(
      (a, b) => (a.levels?.sort_order ?? 0) - (b.levels?.sort_order ?? 0) || a.name.localeCompare(b.name, "fr"),
    )
    .map((s) => ({
      id: s.id,
      name: s.name,
      levelId: s.level_id,
      levelName: s.levels?.name ?? "",
      // Seuls les professeurs actifs et affectés peuvent recevoir un créneau.
      teacherIds: (assignments.get(s.id) ?? []).filter((id) => activeTeachers.has(id)),
    }));
  const subjectById = new Map(subjects.map((s) => [s.id, s] as const));

  return {
    slots: (slotsResult.data ?? []).map((slot) => ({
      id: slot.id,
      subjectId: slot.subject_id,
      subjectName: subjectById.get(slot.subject_id)?.name ?? "",
      levelId: slot.level_id,
      levelName: subjectById.get(slot.subject_id)?.levelName ?? "",
      teacherId: slot.teacher_id,
      teacherName: teacherNames.get(slot.teacher_id) ?? "",
      teacherPhotoUrl: teacherPhotos.get(teacherPhotoPaths.get(slot.teacher_id) ?? "") ?? null,
      dayOfWeek: slot.day_of_week,
      startTime: slot.start_time.slice(0, 5),
      endTime: slot.end_time.slice(0, 5),
      room: slot.room,
    })),
    subjects,
    teachers: (teachersResult.data ?? []).filter((t) => t.active).map((t) => ({ id: t.id, fullName: t.full_name })),
    levels: await getLevelOptions(),
  };
}

// ---------------------------------------------------------------------
// Utilisateurs
// ---------------------------------------------------------------------
export type AdminUser = {
  id: string;
  fullName: string;
  role: UserRole;
  phone: string | null;
  active: boolean;
  email: string;
  lastSignInAt: string | null;
  subjectIds: string[];
  isSelf: boolean;
  photoUrl: string | null;
};

export async function getUsers(): Promise<AdminUser[]> {
  const { profile, supabase } = await adminClient();
  const [usersResult, assignmentsResult] = await Promise.all([
    supabase.rpc("admin_list_users"),
    supabase.from("teacher_assignments").select("teacher_id, subject_id"),
  ]);
  if (usersResult.error) throw usersResult.error;
  if (assignmentsResult.error) throw assignmentsResult.error;

  const photos = await signPhotoUrls(
    supabase,
    usersResult.data.map((user) => user.photo_url),
    STAFF_PHOTO_BUCKET,
  );

  return usersResult.data.map((user) => ({
    id: user.id,
    fullName: user.full_name,
    role: user.role,
    phone: user.phone,
    active: user.active,
    email: user.email,
    lastSignInAt: user.last_sign_in_at,
    subjectIds: assignmentsResult.data.filter((a) => a.teacher_id === user.id).map((a) => a.subject_id),
    isSelf: user.id === profile.id,
    photoUrl: user.photo_url ? (photos.get(user.photo_url) ?? null) : null,
  }));
}

// ---------------------------------------------------------------------
// Élèves
// ---------------------------------------------------------------------
export type AdminStudentRow = {
  id: string;
  fullName: string;
  levelId: string;
  levelName: string;
  photoUrl: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  unpaidAmount: number;
  isOverdue: boolean;
};

export async function getAdminStudents(): Promise<AdminStudentRow[]> {
  const { supabase } = await adminClient();
  const { data, error } = await supabase
    .from("student_directory")
    .select("id, full_name, level_id, level_name, photo_url, guardian_name, guardian_phone, unpaid_amount, is_overdue")
    .order("full_name");
  if (error) throw error;

  const photos = await signPhotoUrls(supabase, data.map((row) => row.photo_url));
  return data.flatMap((row) =>
    row.id && row.full_name && row.level_id
      ? [
          {
            id: row.id,
            fullName: row.full_name,
            levelId: row.level_id,
            levelName: row.level_name ?? "",
            photoUrl: row.photo_url ? (photos.get(row.photo_url) ?? null) : null,
            guardianName: row.guardian_name,
            guardianPhone: row.guardian_phone,
            unpaidAmount: Number(row.unpaid_amount ?? 0),
            isOverdue: row.is_overdue ?? false,
          },
        ]
      : [],
  );
}

// ---------------------------------------------------------------------
// Rapports
// ---------------------------------------------------------------------
export type ReportPeriod = "30" | "90" | "all";

export type LevelReportRow = { levelId: string; levelName: string; students: number; enrollments: number };
export type SubjectReportRow = {
  subjectId: string;
  subjectName: string;
  levelName: string;
  enrollments: number;
  monthlyPrice: number;
  /** Somme des prix convenus des inscriptions actives. */
  monthlyRevenue: number;
};

export type PackReportRow = {
  packId: string;
  packName: string;
  levelName: string;
  subscribers: number;
  monthlyPrice: number;
  monthlyRevenue: number;
};

export type Reports = {
  byLevel: LevelReportRow[];
  bySubject: SubjectReportRow[];
  byPack: PackReportRow[];
  absenceRanking: AbsenceRate[];
};

export async function getReports(period: ReportPeriod): Promise<Reports> {
  const { supabase } = await adminClient();
  const [enrollmentResult, ratesResult, packsResult] = await Promise.all([
    supabase.rpc("admin_enrollment_report"),
    supabase.rpc("admin_absence_rates", { p_days: period === "all" ? undefined : Number(period) }),
    supabase.rpc("admin_pack_report"),
  ]);
  if (enrollmentResult.error) throw enrollmentResult.error;
  if (ratesResult.error) throw ratesResult.error;
  if (packsResult.error) throw packsResult.error;

  const byLevel = new Map<string, LevelReportRow>();
  const bySubject: SubjectReportRow[] = [];
  for (const row of enrollmentResult.data) {
    const level = byLevel.get(row.level_id) ?? {
      levelId: row.level_id,
      levelName: row.level_name,
      students: row.level_students,
      enrollments: 0,
    };
    if (row.subject_id && row.subject_name) {
      level.enrollments += row.active_enrollments ?? 0;
      bySubject.push({
        subjectId: row.subject_id,
        subjectName: row.subject_name,
        levelName: row.level_name,
        enrollments: row.active_enrollments ?? 0,
        monthlyPrice: Number(row.monthly_price ?? 0),
        monthlyRevenue: Number(row.agreed_revenue ?? 0),
      });
    }
    byLevel.set(row.level_id, level);
  }

  return {
    byLevel: [...byLevel.values()],
    bySubject,
    byPack: packsResult.data.map((row) => ({
      packId: row.pack_id,
      packName: row.pack_name,
      levelName: row.level_name,
      subscribers: row.subscribers,
      monthlyPrice: Number(row.monthly_price),
      monthlyRevenue: Number(row.agreed_revenue),
    })),
    absenceRanking: mapRates(ratesResult.data),
  };
}
