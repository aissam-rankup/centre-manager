import "server-only";

import { z } from "zod";

import { requireRole, requireStaff } from "@/lib/auth/session";
import { toISODate, today } from "@/lib/format";
import {
  type BillingRunSummary,
  type CampaignDetail,
  type CampaignListItem,
  defaultCampaign,
  nextMonthOf,
  nextPreparation,
  type ReenrollmentSettings,
  type ReviewLine,
  type ReviewStudent,
} from "@/lib/reenrollment";
import { signPhotoUrls } from "@/lib/storage/photos";
import { createClient } from "@/lib/supabase/server";

const nullableNumber = z.union([z.number(), z.string()]).nullable().transform((value) => (value === null ? null : Number(value)));
const amount = z.union([z.number(), z.string()]).transform(Number);

/** Lignes renvoyées en jsonb par billing_run_review. */
const reviewLinesSchema = z.array(
  z
    .object({
      line_id: z.string(),
      kind: z.enum(["subject", "pack"]),
      source_id: z.string(),
      name: z.string(),
      period_start: z.string(),
      due_date: z.string(),
      amount_full: amount,
      discount_amount: amount,
      amount_due: amount,
      discount_conflict: z.boolean(),
      kept: z.boolean(),
      invoice_id: z.string().nullable(),
      invoice_status: z.enum(["pending", "paid", "overdue"]).nullable(),
      amount_paid: nullableNumber,
      overdue_from: z.string().nullable(),
    })
    .transform(
      (line): ReviewLine => ({
        lineId: line.line_id,
        kind: line.kind,
        sourceId: line.source_id,
        name: line.name,
        periodStart: line.period_start,
        dueDate: line.due_date,
        amountFull: line.amount_full,
        discountAmount: line.discount_amount,
        amountDue: line.amount_due,
        discountConflict: line.discount_conflict,
        kept: line.kept,
        invoiceId: line.invoice_id,
        invoiceStatus: line.invoice_status,
        amountPaid: line.amount_paid,
        overdueFrom: line.overdue_from,
      }),
    ),
);

export type CampaignPage = {
  runs: CampaignListItem[];
  run: CampaignDetail | null;
  students: ReviewStudent[];
  /** Seuil de présence (en %) sous lequel un élève est à risque. */
  riskThreshold: number;
  /** Accueil ou admin, hors mode support, campagne en brouillon. */
  canEdit: boolean;
  /** Admin du centre, hors mode support. */
  canConfirm: boolean;
};

/** Campagnes du centre et revue de celle demandée (ou de celle à traiter). Accueil et admin. */
export async function getCampaignPage(requestedId: string | undefined): Promise<CampaignPage> {
  const profile = await requireStaff();
  const supabase = await createClient();

  const [runsResult, centerResult] = await Promise.all([
    supabase
      .from("billing_runs")
      .select("id, period_year, period_month, status")
      .eq("center_id", profile.centerId)
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false })
      .limit(24),
    supabase.from("centers").select("risk_attendance_threshold").eq("id", profile.centerId).single(),
  ]);
  if (runsResult.error) throw runsResult.error;
  if (centerResult.error) throw centerResult.error;

  const runs: CampaignListItem[] = runsResult.data.map((run) => ({
    id: run.id,
    year: run.period_year,
    month: run.period_month,
    status: run.status,
  }));
  const selected = runs.find((run) => run.id === requestedId) ?? defaultCampaign(runs);
  const isAdmin = profile.role === "admin" && profile.support === null;
  const base = { runs, riskThreshold: centerResult.data.risk_attendance_threshold, canConfirm: isAdmin };
  if (!selected) return { ...base, run: null, students: [], canEdit: false };

  const [runResult, reviewResult] = await Promise.all([
    supabase
      .from("billing_runs")
      .select(
        "id, period_year, period_month, status, student_count, total_expected, generated_at, generated_by, confirmed_at, cancelled_at, cancel_reason, confirmer:profiles!billing_runs_confirmed_by_fkey(full_name)",
      )
      .eq("id", selected.id)
      .single(),
    supabase.rpc("billing_run_review", { p_run_id: selected.id }),
  ]);
  if (runResult.error) throw runResult.error;
  if (reviewResult.error) throw reviewResult.error;

  const row = runResult.data;
  const run: CampaignDetail = {
    id: row.id,
    year: row.period_year,
    month: row.period_month,
    status: row.status,
    studentCount: row.student_count,
    totalExpected: Number(row.total_expected),
    generatedAt: row.generated_at,
    automatic: row.generated_by === null,
    confirmedAt: row.confirmed_at,
    confirmedByName: row.confirmer?.full_name ?? null,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
  };

  const photos = await signPhotoUrls(supabase, reviewResult.data.map((student) => student.photo_url));
  const students: ReviewStudent[] = reviewResult.data.map((student) => ({
    studentId: student.student_id,
    fullName: student.full_name,
    photoUrl: student.photo_url ? (photos.get(student.photo_url) ?? null) : null,
    levelName: student.level_name ?? null,
    guardianName: student.guardian_name ?? null,
    guardianPhone: student.guardian_phone ?? null,
    intent: student.intent,
    reason: student.reason ?? null,
    decidedAt: student.decided_at ?? null,
    decidedByName: student.decided_by_name ?? null,
    appliedAt: student.applied_at ?? null,
    lines: reviewLinesSchema.parse(student.lines),
    amountFull: Number(student.amount_full),
    discountAmount: Number(student.discount_amount),
    amountDue: Number(student.amount_due),
    overdueAmount: Number(student.overdue_amount),
    overdueInvoices: student.overdue_invoices,
    attendanceRate: student.attendance_rate === null ? null : Number(student.attendance_rate),
    attendanceCount: student.attendance_count,
    lowAttendance: student.low_attendance,
    atRisk: student.at_risk,
  }));

  return { ...base, run, students, canEdit: profile.support === null && run.status === "draft" };
}

type BillingRunRow = {
  id: string;
  period_year: number;
  period_month: number;
  status: BillingRunSummary["status"];
  student_count: number;
  total_expected: number;
  generated_at: string;
  generated_by: string | null;
};

function toSummary(row: BillingRunRow): BillingRunSummary {
  return {
    id: row.id,
    year: row.period_year,
    month: row.period_month,
    status: row.status,
    studentCount: row.student_count,
    totalExpected: Number(row.total_expected),
    generatedAt: row.generated_at,
    automatic: row.generated_by === null,
  };
}

/** Réglages de la réinscription automatique, campagne du mois prochain et brouillon du mois en cours (admin). */
export async function getReenrollmentSettings(): Promise<ReenrollmentSettings> {
  const profile = await requireRole("admin");
  const supabase = await createClient();
  const todayIso = toISODate(today());
  const next = nextMonthOf(todayIso);
  const [year = 0, month = 1] = todayIso.split("-").map(Number);

  const [center, runs] = await Promise.all([
    supabase
      .from("centers")
      .select("auto_reenrollment_enabled, billing_generation_day, payment_due_day")
      .eq("id", profile.centerId)
      .single(),
    supabase
      .from("billing_runs")
      .select("id, period_year, period_month, status, student_count, total_expected, generated_at, generated_by")
      .eq("center_id", profile.centerId)
      .or(
        `and(period_year.eq.${year},period_month.eq.${month}),and(period_year.eq.${next.year},period_month.eq.${next.month})`,
      ),
  ]);
  if (center.error) throw center.error;
  if (runs.error) throw runs.error;

  const nextRun = runs.data.find((run) => run.period_year === next.year && run.period_month === next.month);
  const currentRun = runs.data.find((run) => run.period_year === year && run.period_month === month);

  return {
    enabled: center.data.auto_reenrollment_enabled,
    generationDay: center.data.billing_generation_day,
    dueDay: center.data.payment_due_day,
    support: profile.support !== null,
    nextMonth: next,
    preparation: nextPreparation(todayIso, center.data.billing_generation_day),
    nextRun: nextRun ? toSummary(nextRun) : null,
    currentDraft: currentRun?.status === "draft" ? toSummary(currentRun) : null,
  };
}
