import "server-only";

import { requireRole } from "@/lib/auth/session";
import type { PayrollMonth } from "@/lib/payroll";
import { type SalaryPaymentRow, type SalaryReceiptView, toSalaryReceiptView } from "@/lib/salary-receipts";
import { createClient } from "@/lib/supabase/server";

/** Admin du centre hors mode support : les reçus de paie ne sont jamais montrés ailleurs (RLS : can_read_finance). */
async function financeClient() {
  const profile = await requireRole("admin");
  if (profile.support) return null;
  return createClient();
}

type Supabase = NonNullable<Awaited<ReturnType<typeof financeClient>>>;

/** Liens entre reçus : numéro du reçu annulé, reçu d'annulation émis. */
async function withLinks(supabase: Supabase, rows: SalaryPaymentRow[]): Promise<SalaryReceiptView[]> {
  const ids = rows.map((row) => row.id);
  const originalIds = rows.flatMap((row) => (row.cancels_payment_id ? [row.cancels_payment_id] : []));
  const [originals, cancellations] = await Promise.all([
    originalIds.length > 0
      ? supabase.from("salary_payments").select("id, receipt_number").in("id", originalIds)
      : Promise.resolve({ data: [], error: null }),
    ids.length > 0
      ? supabase.from("salary_payments").select("id, receipt_number, issued_at, cancels_payment_id").in("cancels_payment_id", ids)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (originals.error) throw originals.error;
  if (cancellations.error) throw cancellations.error;

  const numbers = new Map((originals.data ?? []).map((row) => [row.id, row.receipt_number ?? ""]));
  const cancelledBy = new Map(
    (cancellations.data ?? []).map((row) => [row.cancels_payment_id ?? "", { id: row.id, number: row.receipt_number ?? "", issuedAt: row.issued_at }]),
  );
  return rows.map((row) =>
    toSalaryReceiptView(row, {
      cancelsNumber: row.cancels_payment_id ? (numbers.get(row.cancels_payment_id) ?? null) : null,
      cancelledBy: cancelledBy.get(row.id) ?? null,
    }),
  );
}

/** Un reçu de paie (null : introuvable, autre centre, ou mode support). */
export async function getSalaryReceipt(id: string): Promise<SalaryReceiptView | null> {
  const supabase = await financeClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("salary_payments").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return (await withLinks(supabase, [data]))[0];
}

export type SalaryReceiptFilters = { memberId: string | null; period: PayrollMonth | null };

export type SalaryReceiptList = {
  receipts: SalaryReceiptView[];
  /** Membres ayant au moins un reçu (filtre), par nom. */
  members: { id: string; name: string }[];
  /** Périodes ayant au moins un reçu, de la plus récente à la plus ancienne. */
  periods: PayrollMonth[];
};

/** Historique des reçus de paie du centre, du plus récent au plus ancien. */
export async function listSalaryReceipts(filters: SalaryReceiptFilters): Promise<SalaryReceiptList> {
  const supabase = await financeClient();
  if (!supabase) return { receipts: [], members: [], periods: [] };

  let query = supabase.from("salary_payments").select("*").order("issued_at", { ascending: false }).order("receipt_seq", { ascending: false });
  if (filters.memberId) query = query.eq("member_id", filters.memberId);
  if (filters.period) query = query.eq("period_year", filters.period.year).eq("period_month", filters.period.month);

  const [rows, facets] = await Promise.all([
    query.limit(500),
    supabase.from("salary_payments").select("member_id, member_name, period_year, period_month"),
  ]);
  if (rows.error) throw rows.error;
  if (facets.error) throw facets.error;

  const members = new Map<string, string>();
  const periods = new Map<string, PayrollMonth>();
  for (const row of facets.data ?? []) {
    if (row.member_id && !members.has(row.member_id)) members.set(row.member_id, row.member_name);
    periods.set(`${row.period_year}-${row.period_month}`, { year: row.period_year, month: row.period_month });
  }

  return {
    receipts: await withLinks(supabase, rows.data ?? []),
    members: [...members].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "fr")),
    periods: [...periods.values()].sort((a, b) => b.year - a.year || b.month - a.month),
  };
}

/** Reçu en vigueur (non annulé) de chaque ligne de paie versée. */
export async function getLineReceiptIds(lineIds: string[]): Promise<Map<string, string>> {
  const supabase = await financeClient();
  if (!supabase || lineIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("salary_payments")
    .select("id, payroll_line_id, kind, cancels_payment_id, issued_at")
    .in("payroll_line_id", lineIds)
    .order("issued_at");
  if (error) throw error;

  const cancelled = new Set((data ?? []).flatMap((row) => (row.cancels_payment_id ? [row.cancels_payment_id] : [])));
  const result = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.kind === "payment" && !cancelled.has(row.id) && row.payroll_line_id) result.set(row.payroll_line_id, row.id);
  }
  return result;
}
