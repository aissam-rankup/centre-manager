import "server-only";

import { requireRole } from "@/lib/auth/session";
import type { DiscountReason } from "@/lib/discounts";
import { createClient } from "@/lib/supabase/server";

export type FinanceMonth = {
  monthStart: string;
  expected: number;
  collected: number;
  payroll: number;
  expenses: number;
  /** Encaissé − masse salariale − charges. */
  net: number;
  discounts: number;
  discountStudents: number;
};

export type FinancialDashboard = {
  /** Douze mois, du plus ancien au mois en cours. */
  months: FinanceMonth[];
  current: FinanceMonth;
  discountsByReason: { reason: DiscountReason; amount: number; students: number }[];
};

/** Résultat financier (admin du centre ; null en mode support). */
export async function getFinancialDashboard(): Promise<FinancialDashboard | null> {
  const profile = await requireRole("admin");
  if (profile.support) return null;
  const supabase = await createClient();

  const [summary, discounts] = await Promise.all([
    supabase.rpc("admin_financial_summary", { p_months: 12 }),
    supabase.rpc("admin_discount_summary", {}),
  ]);
  if (summary.error) throw summary.error;
  if (discounts.error) throw discounts.error;

  const months = summary.data.map((row) => {
    const collected = Number(row.collected);
    const payroll = Number(row.payroll);
    const expenses = Number(row.expenses);
    return {
      monthStart: row.month_start,
      expected: Number(row.expected),
      collected,
      payroll,
      expenses,
      net: Math.round((collected - payroll - expenses) * 100) / 100,
      discounts: Number(row.discounts),
      discountStudents: row.discount_students,
    };
  });
  const current = months[months.length - 1];
  if (!current) return null;

  return {
    months,
    current,
    discountsByReason: discounts.data.map((row) => ({ reason: row.reason, amount: Number(row.amount), students: row.students })),
  };
}
