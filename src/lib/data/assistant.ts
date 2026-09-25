import "server-only";

import { requireStaff } from "@/lib/auth/session";
import { toISODate, today } from "@/lib/format";
import { signPhotoUrls } from "@/lib/storage/photos";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];
type FollowUpType = Database["public"]["Enums"]["follow_up_type"];
type FollowUpChannel = Database["public"]["Enums"]["follow_up_channel"];

/** Statut affiché : une facture en attente dont l'échéance est dépassée est en retard. */
export function effectiveInvoiceStatus(status: InvoiceStatus, dueDate: string, todayIso = toISODate(today())): InvoiceStatus {
  return status === "pending" && dueDate < todayIso ? "overdue" : status;
}

// ---------------------------------------------------------------------
// Tableau de bord
// ---------------------------------------------------------------------
export type DashboardStats = {
  unpaidCount: number;
  unpaidAmount: number;
  overdueCount: number;
  overdueAmount: number;
  overdueStudents: number;
  absencesToday: number;
  openAbsenceAlerts: number;
};

export type FollowUpQueueItem = {
  studentId: string;
  fullName: string;
  levelName: string;
  photoUrl: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  overdueCount: number;
  overdueAmount: number;
  oldestInvoiceId: string | null;
  oldestDueDate: string;
  daysOverdue: number;
  lastFollowUpAt: string | null;
};

export type AbsenceAlertItem = {
  id: string;
  studentId: string;
  fullName: string;
  levelName: string;
  photoUrl: string | null;
  subjectName: string;
  absenceCount: number;
  lastSessionDate: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
};

export type AssistantDashboard = {
  stats: DashboardStats;
  queue: FollowUpQueueItem[];
  alerts: AbsenceAlertItem[];
};

export async function getAssistantDashboard(): Promise<AssistantDashboard> {
  await requireStaff();
  const supabase = await createClient();

  const [statsResult, queueResult, alertsResult] = await Promise.all([
    supabase.rpc("assistant_dashboard_stats").single(),
    supabase
      .from("follow_up_queue")
      .select("*")
      .eq("followed_up_today", false)
      .order("oldest_due_date", { ascending: true })
      .order("overdue_amount", { ascending: false })
      .limit(50),
    supabase.from("open_absence_alerts").select("*").order("created_at", { ascending: false }).limit(50),
  ]);

  if (statsResult.error) throw statsResult.error;
  if (queueResult.error) throw queueResult.error;
  if (alertsResult.error) throw alertsResult.error;

  const photos = await signPhotoUrls(supabase, [
    ...queueResult.data.map((row) => row.photo_url),
    ...alertsResult.data.map((row) => row.photo_url),
  ]);
  const photo = (path: string | null) => (path ? (photos.get(path) ?? null) : null);

  const s = statsResult.data;
  return {
    stats: {
      unpaidCount: s.unpaid_count,
      unpaidAmount: Number(s.unpaid_amount),
      overdueCount: s.overdue_count,
      overdueAmount: Number(s.overdue_amount),
      overdueStudents: s.overdue_students,
      absencesToday: s.absences_today,
      openAbsenceAlerts: s.open_absence_alerts,
    },
    queue: queueResult.data.flatMap((row) =>
      row.student_id && row.full_name && row.oldest_due_date
        ? [
            {
              studentId: row.student_id,
              fullName: row.full_name,
              levelName: row.level_name ?? "",
              photoUrl: photo(row.photo_url),
              guardianName: row.guardian_name,
              guardianPhone: row.guardian_phone,
              overdueCount: row.overdue_count ?? 0,
              overdueAmount: Number(row.overdue_amount ?? 0),
              oldestInvoiceId: row.oldest_invoice_id,
              oldestDueDate: row.oldest_due_date,
              daysOverdue: row.days_overdue ?? 0,
              lastFollowUpAt: row.last_follow_up_at,
            },
          ]
        : [],
    ),
    alerts: alertsResult.data.flatMap((row) =>
      row.id && row.student_id && row.full_name
        ? [
            {
              id: row.id,
              studentId: row.student_id,
              fullName: row.full_name,
              levelName: row.level_name ?? "",
              photoUrl: photo(row.photo_url),
              subjectName: row.subject_name ?? "",
              absenceCount: row.absence_count ?? 3,
              lastSessionDate: row.last_session_date,
              guardianName: row.guardian_name,
              guardianPhone: row.guardian_phone,
            },
          ]
        : [],
    ),
  };
}

// ---------------------------------------------------------------------
// Recherche
// ---------------------------------------------------------------------
export type StudentListItem = {
  id: string;
  fullName: string;
  levelName: string;
  photoUrl: string | null;
  isOverdue: boolean;
};

/** Même normalisation que private.normalize_search : minuscules, sans accents. */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export const SEARCH_LIMIT = 50;

export async function searchStudentDirectory(query: string): Promise<StudentListItem[]> {
  await requireStaff();
  const supabase = await createClient();

  let request = supabase
    .from("student_directory")
    .select("id, full_name, level_name, photo_url, is_overdue")
    .order("full_name", { ascending: true })
    .limit(SEARCH_LIMIT);

  const normalized = normalizeSearch(query);
  if (normalized) {
    // Échappement des jokers LIKE saisis par l'utilisateur.
    const pattern = normalized.replace(/[\\%_]/g, (char) => `\\${char}`);
    request = request.ilike("search_name", `%${pattern}%`);
  }

  const { data, error } = await request;
  if (error) throw error;

  const photos = await signPhotoUrls(supabase, data.map((row) => row.photo_url));
  return data.flatMap((row) =>
    row.id && row.full_name
      ? [
          {
            id: row.id,
            fullName: row.full_name,
            levelName: row.level_name ?? "",
            photoUrl: row.photo_url ? (photos.get(row.photo_url) ?? null) : null,
            isOverdue: row.is_overdue ?? false,
          },
        ]
      : [],
  );
}

// ---------------------------------------------------------------------
// Fiche élève
// ---------------------------------------------------------------------
export type StudentEnrollment = {
  id: string;
  subjectId: string;
  subjectName: string;
  priceAgreed: number;
  billingDay: number;
  startDate: string;
  active: boolean;
  nextDueDate: string | null;
};

export type StudentInvoice = {
  id: string;
  subjectName: string;
  periodStart: string;
  periodEnd: string;
  amountDue: number;
  status: InvoiceStatus;
  dueDate: string;
  paidAt: string | null;
};

export type StudentAbsence = { id: string; sessionDate: string; subjectName: string };

export type StudentFollowUp = {
  id: string;
  type: FollowUpType;
  channel: FollowUpChannel;
  note: string | null;
  createdAt: string;
  authorName: string | null;
};

export type StudentFile = {
  id: string;
  fullName: string;
  levelId: string;
  levelName: string;
  photoUrl: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  notes: string | null;
  createdAt: string;
  isOverdue: boolean;
  oldestOverdueInvoiceId: string | null;
  enrollments: StudentEnrollment[];
  invoices: StudentInvoice[];
  absences: StudentAbsence[];
  followUps: StudentFollowUp[];
};

export async function getStudentFile(studentId: string): Promise<StudentFile | null> {
  await requireStaff();
  const supabase = await createClient();

  const { data: student, error } = await supabase
    .from("students")
    .select("id, full_name, level_id, photo_url, guardian_name, guardian_phone, notes, created_at, levels(name)")
    .eq("id", studentId)
    .maybeSingle();
  if (error) throw error;
  if (!student) return null;

  const [enrollmentsResult, invoicesResult, absencesResult, followUpsResult] = await Promise.all([
    supabase
      .from("enrollments")
      .select("id, subject_id, start_date, price_agreed, billing_day, active, subjects(name)")
      .eq("student_id", studentId)
      .order("start_date", { ascending: true }),
    supabase
      .from("invoices")
      .select("id, enrollment_id, period_start, period_end, amount_due, status, due_date, paid_at, enrollments(subjects(name))")
      .eq("student_id", studentId)
      .order("period_start", { ascending: false })
      .order("due_date", { ascending: false }),
    supabase
      .from("attendance")
      .select("id, session_date, subjects(name)")
      .eq("student_id", studentId)
      .eq("status", "absent")
      .order("session_date", { ascending: false }),
    supabase
      .from("follow_ups")
      .select("id, type, channel, note, created_at, profiles(full_name)")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false }),
  ]);

  if (enrollmentsResult.error) throw enrollmentsResult.error;
  if (invoicesResult.error) throw invoicesResult.error;
  if (absencesResult.error) throw absencesResult.error;
  if (followUpsResult.error) throw followUpsResult.error;

  const todayIso = toISODate(today());
  const invoices: StudentInvoice[] = invoicesResult.data.map((row) => ({
    id: row.id,
    subjectName: row.enrollments?.subjects?.name ?? "",
    periodStart: row.period_start,
    periodEnd: row.period_end,
    amountDue: Number(row.amount_due),
    status: effectiveInvoiceStatus(row.status, row.due_date, todayIso),
    dueDate: row.due_date,
    paidAt: row.paid_at,
  }));

  const unpaidByEnrollment = new Map<string, string>();
  for (const row of invoicesResult.data) {
    if (row.status === "paid") continue;
    const current = unpaidByEnrollment.get(row.enrollment_id);
    if (!current || row.due_date < current) unpaidByEnrollment.set(row.enrollment_id, row.due_date);
  }

  const overdue = invoices
    .filter((invoice) => invoice.status === "overdue")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const photos = await signPhotoUrls(supabase, [student.photo_url]);

  return {
    id: student.id,
    fullName: student.full_name,
    levelId: student.level_id,
    levelName: student.levels?.name ?? "",
    photoUrl: student.photo_url ? (photos.get(student.photo_url) ?? null) : null,
    guardianName: student.guardian_name,
    guardianPhone: student.guardian_phone,
    notes: student.notes,
    createdAt: student.created_at,
    isOverdue: overdue.length > 0,
    oldestOverdueInvoiceId: overdue[0]?.id ?? null,
    enrollments: enrollmentsResult.data.map((row) => ({
      id: row.id,
      subjectId: row.subject_id,
      subjectName: row.subjects?.name ?? "",
      priceAgreed: Number(row.price_agreed),
      billingDay: row.billing_day ?? 1,
      startDate: row.start_date,
      active: row.active,
      nextDueDate: unpaidByEnrollment.get(row.id) ?? null,
    })),
    invoices,
    absences: absencesResult.data.map((row) => ({
      id: row.id,
      sessionDate: row.session_date,
      subjectName: row.subjects?.name ?? "",
    })),
    followUps: followUpsResult.data.map((row) => ({
      id: row.id,
      type: row.type,
      channel: row.channel,
      note: row.note,
      createdAt: row.created_at,
      authorName: row.profiles?.full_name ?? null,
    })),
  };
}

// ---------------------------------------------------------------------
// Référentiel : niveaux et matières (formulaires)
// ---------------------------------------------------------------------
export type LevelWithSubjects = {
  id: string;
  name: string;
  subjects: { id: string; name: string; monthlyPrice: number }[];
};

export async function getLevelsWithSubjects(): Promise<LevelWithSubjects[]> {
  await requireStaff();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("levels")
    .select("id, name, sort_order, subjects(id, name, monthly_price)")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;

  return data.map((level) => ({
    id: level.id,
    name: level.name,
    subjects: [...level.subjects]
      .sort((a, b) => a.name.localeCompare(b.name, "fr"))
      .map((subject) => ({ id: subject.id, name: subject.name, monthlyPrice: Number(subject.monthly_price) })),
  }));
}
