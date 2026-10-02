import "server-only";

import { requireRole } from "@/lib/auth/session";
import { toISODate, today } from "@/lib/format";
import { type BillingRunSummary, nextMonthOf, nextPreparation, type ReenrollmentSettings } from "@/lib/reenrollment";
import { createClient } from "@/lib/supabase/server";

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
