import "server-only";

import { requireRole } from "@/lib/auth/session";
import {
  type CategoryTotal,
  EXPENSE_RECEIPTS_BUCKET,
  type ExpenseCategoryView,
  type ExpenseView,
  toExpenseIcon,
} from "@/lib/expenses";
import { type PayrollMonth, shiftMonth } from "@/lib/payroll";
import { createClient } from "@/lib/supabase/server";

export type ExpensesMonth = {
  categories: ExpenseCategoryView[];
  /** Charges du mois (brouillons compris), hors charges supprimées. */
  expenses: ExpenseView[];
  /** Totaux confirmés par catégorie : mois choisi et mois précédent. */
  totals: CategoryTotal[];
  total: number;
  previousTotal: number;
};

const RECEIPT_LINK_SECONDS = 60 * 60;

/** Charges d'un mois (admin, jamais en mode support : null). */
export async function getExpensesMonth(month: PayrollMonth): Promise<ExpensesMonth | null> {
  const profile = await requireRole("admin");
  if (profile.support) return null;
  const supabase = await createClient();
  const previous = shiftMonth(month, -1);

  const [categories, current, before] = await Promise.all([
    supabase.from("expense_categories").select("id, name, icon, is_recurring, is_active, sort_order").order("sort_order").order("name"),
    supabase
      .from("expenses")
      .select(
        "id, category_id, label, amount, expense_date, payment_method, receipt_url, is_recurring, recurrence_source_id, status, notes, created_at, profiles!expenses_recorded_by_fkey(full_name)",
      )
      .eq("period_year", month.year)
      .eq("period_month", month.month)
      .is("deleted_at", null)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("expenses")
      .select("category_id, amount")
      .eq("period_year", previous.year)
      .eq("period_month", previous.month)
      .eq("status", "confirmed")
      .is("deleted_at", null),
  ]);
  if (categories.error) throw categories.error;
  if (current.error) throw current.error;
  if (before.error) throw before.error;

  // Série d'une occurrence recopiée : récurrence portée par la charge d'origine.
  const sourceIds = [...new Set(current.data.flatMap((row) => (row.recurrence_source_id ? [row.recurrence_source_id] : [])))];
  const sources = sourceIds.length
    ? await supabase.from("expenses").select("id, is_recurring, deleted_at").in("id", sourceIds)
    : { data: [], error: null };
  if (sources.error) throw sources.error;
  const sourceRecurring = new Map(sources.data.map((row) => [row.id, row.is_recurring && !row.deleted_at] as const));

  const paths = current.data.flatMap((row) => (row.receipt_url ? [row.receipt_url] : []));
  const signed = paths.length
    ? await supabase.storage.from(EXPENSE_RECEIPTS_BUCKET).createSignedUrls(paths, RECEIPT_LINK_SECONDS)
    : { data: [], error: null };
  const urls = new Map((signed.data ?? []).flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [])));

  const expenses: ExpenseView[] = current.data.map((row) => ({
    id: row.id,
    categoryId: row.category_id,
    label: row.label,
    amount: Number(row.amount),
    date: row.expense_date,
    method: row.payment_method,
    receiptPath: row.receipt_url,
    receiptUrl: row.receipt_url ? (urls.get(row.receipt_url) ?? null) : null,
    seriesId: row.recurrence_source_id ?? row.id,
    recurring: row.recurrence_source_id ? (sourceRecurring.get(row.recurrence_source_id) ?? false) : row.is_recurring,
    status: row.status,
    notes: row.notes,
    recordedByName: row.profiles?.full_name ?? null,
  }));

  const sum = (rows: { category_id: string; amount: number }[], categoryId: string) =>
    rows.filter((row) => row.category_id === categoryId).reduce((total, row) => total + Number(row.amount), 0);
  const confirmed = current.data.filter((row) => row.status === "confirmed");
  const totals = categories.data
    .map((category) => ({ categoryId: category.id, current: sum(confirmed, category.id), previous: sum(before.data, category.id) }))
    .filter((row) => row.current > 0 || row.previous > 0);

  return {
    categories: categories.data.map((row) => ({
      id: row.id,
      name: row.name,
      icon: toExpenseIcon(row.icon),
      isRecurring: row.is_recurring,
      isActive: row.is_active,
      sortOrder: row.sort_order,
    })),
    expenses,
    totals,
    total: confirmed.reduce((total, row) => total + Number(row.amount), 0),
    previousTotal: before.data.reduce((total, row) => total + Number(row.amount), 0),
  };
}
