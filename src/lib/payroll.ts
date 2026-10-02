import { formatMonth } from "@/lib/format";
import type { Database, Json } from "@/lib/supabase/database.types";

export type PayMode = Database["public"]["Enums"]["pay_mode"];
export type PayrollStatus = Database["public"]["Enums"]["payroll_status"];

export const PAY_MODES = ["fixed_salary", "commission"] as const satisfies readonly PayMode[];

/** Mois de paie : « 2026-10 ». */
export type PayrollMonth = { year: number; month: number };

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function parsePayrollMonth(value: string | string[] | undefined, fallback: PayrollMonth): PayrollMonth {
  const match = typeof value === "string" ? MONTH_PATTERN.exec(value) : null;
  return match ? { year: Number(match[1]), month: Number(match[2]) } : fallback;
}

export function monthKey({ year, month }: PayrollMonth): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function shiftMonth({ year, month }: PayrollMonth, delta: number): PayrollMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function compareMonths(a: PayrollMonth, b: PayrollMonth): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

/** « Octobre 2026 » */
export function monthLabel(value: PayrollMonth): string {
  const label = formatMonth(`${monthKey(value)}-01`);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export type CommissionDetailLine = {
  subjectId: string;
  subject: string;
  level: string;
  monthlyPrice: number;
  enrolled: number;
  ratePercent: number | null;
  subtotal: number;
};

export type PayrollDetail =
  | { kind: "commission"; subjects: CommissionDetailLine[] }
  | { kind: "fixed_salary"; monthlyAmount: number | null; effectiveFrom: string | null }
  | { kind: "none" };

function isRecord(value: Json | undefined): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Détail du calcul tel qu'enregistré sur la ligne de paie. */
export function parsePayrollDetail(mode: PayMode | null, value: Json): PayrollDetail {
  if (!isRecord(value)) return { kind: "none" };
  if (mode === "commission") {
    const subjects = Array.isArray(value.subjects) ? value.subjects : [];
    return {
      kind: "commission",
      subjects: subjects.flatMap((item) =>
        isRecord(item)
          ? [
              {
                subjectId: String(item.subject_id ?? ""),
                subject: String(item.subject ?? ""),
                level: String(item.level ?? ""),
                monthlyPrice: Number(item.monthly_price ?? 0),
                enrolled: Number(item.enrolled ?? 0),
                ratePercent: item.rate_percent === null || item.rate_percent === undefined ? null : Number(item.rate_percent),
                subtotal: Number(item.subtotal ?? 0),
              },
            ]
          : [],
      ),
    };
  }
  if (mode === "fixed_salary") {
    return {
      kind: "fixed_salary",
      monthlyAmount: value.monthly_amount === null || value.monthly_amount === undefined ? null : Number(value.monthly_amount),
      effectiveFrom: typeof value.effective_from === "string" ? value.effective_from : null,
    };
  }
  return { kind: "none" };
}

/** « 30 % » */
export function formatRate(rate: number): string {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(rate)} %`;
}
