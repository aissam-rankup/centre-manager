import "server-only";

import { requireRole } from "@/lib/auth/session";
import { toISODate, today } from "@/lib/format";
import { type PayMode, type PayrollDetail, type PayrollMonth, type PayrollStatus, parsePayrollDetail } from "@/lib/payroll";
import type { PaymentMethod } from "@/lib/receipts";
import { createClient } from "@/lib/supabase/server";

export type PayrollLineView = {
  id: string;
  teacherId: string;
  teacherName: string;
  payMode: PayMode | null;
  computed: number;
  adjustment: number;
  adjustmentReason: string | null;
  final: number;
  paidAt: string | null;
  paymentMethod: PaymentMethod | null;
  detail: PayrollDetail;
};

export type PayrollView = {
  periodId: string;
  month: PayrollMonth;
  status: PayrollStatus;
  validatedAt: string | null;
  validatedByName: string | null;
  total: number;
  lines: PayrollLineView[];
};

/**
 * Paie d'un mois : le brouillon est recalculé à chaque consultation (inscriptions,
 * taux et salaires du moment) ; une paie validée reste figée.
 * Null en mode support : les finances d'un centre ne sont jamais montrées.
 */
export async function getPayroll(month: PayrollMonth): Promise<PayrollView | null> {
  const profile = await requireRole("admin");
  if (profile.support) return null;
  const supabase = await createClient();

  const { data: period, error } = await supabase.rpc("payroll_refresh", { p_year: month.year, p_month: month.month });
  if (error) throw error;

  const [{ data: lines, error: linesError }, { data: validator, error: validatorError }] = await Promise.all([
    supabase
      .from("payroll_lines")
      .select("id, teacher_id, teacher_name, pay_mode, computed_amount, adjustment_amount, adjustment_reason, final_amount, paid_at, payment_method, detail")
      .eq("payroll_period_id", period.id)
      .order("teacher_name"),
    period.validated_by
      ? supabase.from("profiles").select("full_name").eq("id", period.validated_by).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (linesError) throw linesError;
  if (validatorError) throw validatorError;

  return {
    periodId: period.id,
    month,
    status: period.status,
    validatedAt: period.validated_at,
    validatedByName: validator?.full_name ?? null,
    total: Number(period.total_amount),
    lines: lines.map((line) => ({
      id: line.id,
      teacherId: line.teacher_id,
      teacherName: line.teacher_name,
      payMode: line.pay_mode,
      computed: Number(line.computed_amount),
      adjustment: Number(line.adjustment_amount),
      adjustmentReason: line.adjustment_reason,
      final: Number(line.final_amount ?? 0),
      paidAt: line.paid_at,
      paymentMethod: line.payment_method,
      detail: parsePayrollDetail(line.pay_mode, line.detail),
    })),
  };
}

export type PayHistoryEntry = { value: number; from: string; to: string | null };

export type TeacherPaySettings = {
  teacherId: string;
  teacherName: string;
  payMode: PayMode | null;
  /** Salaire en vigueur aujourd'hui. */
  currentSalary: number | null;
  salaryHistory: PayHistoryEntry[];
  subjects: {
    subjectId: string;
    subject: string;
    level: string;
    currentRate: number | null;
    history: PayHistoryEntry[];
  }[];
};

function current(history: PayHistoryEntry[], todayIso: string): number | null {
  return history.find((entry) => entry.from <= todayIso && (entry.to === null || entry.to >= todayIso))?.value ?? null;
}

/** Rémunération de chaque professeur actif : mode, salaires, taux par matière. */
export async function getTeacherPaySettings(): Promise<TeacherPaySettings[]> {
  const profile = await requireRole("admin");
  if (profile.support) return [];
  const supabase = await createClient();

  const [teachers, assignments, salaries, commissions] = await Promise.all([
    supabase.from("profiles").select("id, full_name, pay_mode").eq("role", "teacher").eq("active", true).order("full_name"),
    supabase.from("teacher_assignments").select("teacher_id, subject_id, subjects(name, levels(name, sort_order))"),
    supabase.from("teacher_salaries").select("teacher_id, monthly_amount, effective_from, effective_to").order("effective_from", { ascending: false }),
    supabase
      .from("teacher_commissions")
      .select("teacher_id, subject_id, rate_percent, effective_from, effective_to")
      .order("effective_from", { ascending: false }),
  ]);
  for (const result of [teachers, assignments, salaries, commissions]) if (result.error) throw result.error;

  const todayIso = toISODate(today());
  return (teachers.data ?? []).map((teacher) => {
    const salaryHistory = (salaries.data ?? [])
      .filter((row) => row.teacher_id === teacher.id)
      .map((row) => ({ value: Number(row.monthly_amount), from: row.effective_from, to: row.effective_to }));
    const subjects = (assignments.data ?? [])
      .filter((row) => row.teacher_id === teacher.id)
      .sort(
        (a, b) =>
          (a.subjects?.levels?.sort_order ?? 0) - (b.subjects?.levels?.sort_order ?? 0) ||
          (a.subjects?.name ?? "").localeCompare(b.subjects?.name ?? "", "fr"),
      )
      .map((row) => {
        const history = (commissions.data ?? [])
          .filter((rate) => rate.teacher_id === teacher.id && rate.subject_id === row.subject_id)
          .map((rate) => ({ value: Number(rate.rate_percent), from: rate.effective_from, to: rate.effective_to }));
        return {
          subjectId: row.subject_id,
          subject: row.subjects?.name ?? "",
          level: row.subjects?.levels?.name ?? "",
          currentRate: current(history, todayIso),
          history,
        };
      });
    return {
      teacherId: teacher.id,
      teacherName: teacher.full_name,
      payMode: teacher.pay_mode,
      currentSalary: current(salaryHistory, todayIso),
      salaryHistory,
      subjects,
    };
  });
}
