import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Minus, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/components/shared/app-link";

import { ExpenseIcon } from "@/components/expenses/expense-icon";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/auth/routes";
import { requireModule, requireRole } from "@/lib/auth/session";
import type { AppLabels } from "@/lib/constants/labels";
import { type ExpensesMonth, getExpensesMonth } from "@/lib/data/expenses";
import { formatMAD, formatMonth, formatPercent, toISODate, today } from "@/lib/format";
import { getAppLocale } from "@/lib/i18n/request-locale";
import { getLabels } from "@/lib/i18n/server";
import { compareMonths, monthKey, parsePayrollMonth, type PayrollMonth, shiftMonth } from "@/lib/payroll";

import { ExpensesBoard } from "./expenses-board";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLabels()).expenses.title };
}

/** Charges du centre : un mois à la fois (jamais un mois à venir). */
export default async function ExpensesPage({ searchParams }: PageProps<"/admin/charges">) {
  const LABELS = await getLabels();
  const X = LABELS.expenses;
  const profile = await requireRole("admin");
  requireModule(profile, "finance");
  if (profile.support) return <EmptyState icon={ShieldAlert} title={X.title} description={X.supportUnavailable} />;

  const now = today();
  const current: PayrollMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const requested = parsePayrollMonth((await searchParams).mois, current);
  const month = compareMonths(requested, current) > 0 ? current : requested;
  const isCurrent = compareMonths(month, current) === 0;
  const data = await getExpensesMonth(month);
  if (!data) return <EmptyState icon={ShieldAlert} title={X.title} description={X.supportUnavailable} />;

  const href = (value: PayrollMonth) => `${ROUTES.admin.expenses}?mois=${monthKey(value)}`;
  const monthName = formatMonth(`${monthKey(month)}-01`, await getAppLocale());

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={X.title} description={X.description} showTitle />

      <nav aria-label={X.month} className="flex items-center justify-between gap-2 rounded-xl bg-card p-2 shadow-card sm:w-fit">
        <Button asChild variant="ghost" size="icon" aria-label={X.previousMonth}>
          <Link href={href(shiftMonth(month, -1))}>
            <ChevronLeft aria-hidden />
          </Link>
        </Button>
        <span className="min-w-40 text-center font-semibold">{monthName.charAt(0).toUpperCase() + monthName.slice(1)}</span>
        {isCurrent ? (
          <Button variant="ghost" size="icon" disabled aria-label={X.nextMonth}>
            <ChevronRight aria-hidden />
          </Button>
        ) : (
          <Button asChild variant="ghost" size="icon" aria-label={X.nextMonth}>
            <Link href={href(shiftMonth(month, 1))}>
              <ChevronRight aria-hidden />
            </Link>
          </Button>
        )}
      </nav>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ExpensesBoard
          categories={data.categories}
          expenses={data.expenses}
          defaultDate={isCurrent ? toISODate(now) : `${monthKey(month)}-01`}
          total={data.total}
        />
        <div className="flex flex-col gap-6">
          <Breakdown data={data} LABELS={LABELS} />
          <Comparison data={data} LABELS={LABELS} />
        </div>
      </div>
    </div>
  );
}

/** Part de chaque catégorie dans le total du mois (charges confirmées). */
function Breakdown({ data, LABELS }: { data: ExpensesMonth; LABELS: AppLabels }) {
  const B = LABELS.expenses.breakdown;
  const categories = new Map(data.categories.map((category) => [category.id, category]));
  const rows = data.totals.filter((row) => row.current > 0).sort((a, b) => b.current - a.current);

  return (
    <SectionCard title={B.title}>
      {rows.length === 0 || data.total === 0 ? (
        <p className="text-muted-foreground">{B.empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const category = categories.get(row.categoryId);
            const share = row.current / data.total;
            return (
              <li key={row.categoryId} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <ExpenseIcon name={category?.icon ?? "receipt"} className="size-7" />
                    <span className="truncate font-medium">{category?.name}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="numeric font-semibold">{formatMAD(row.current)}</span>
                    <span className="block text-caption text-muted-foreground">{B.share(formatPercent(share))}</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(share * 100, 1.5)}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

/** Écart avec le mois précédent, global et par catégorie (MAD et %). */
function Comparison({ data, LABELS }: { data: ExpensesMonth; LABELS: AppLabels }) {
  const C = LABELS.expenses.comparison;
  const categories = new Map(data.categories.map((category) => [category.id, category]));
  const rows = [...data.totals].sort((a, b) => Math.abs(b.current - b.previous) - Math.abs(a.current - a.previous));

  const delta = (current: number, previous: number) => {
    const diff = current - previous;
    if (diff === 0) return { icon: Minus, text: C.same };
    if (previous === 0) return { icon: ArrowUpRight, text: C.newSpend };
    const percent = formatPercent(Math.abs(diff) / previous);
    return diff > 0
      ? { icon: ArrowUpRight, text: C.up(formatMAD(diff), percent) }
      : { icon: ArrowDownRight, text: C.down(formatMAD(-diff), percent) };
  };
  const overall = delta(data.total, data.previousTotal);

  return (
    <SectionCard title={C.title}>
      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-muted px-3 py-2">
          <dt className="text-caption text-muted-foreground">{C.current}</dt>
          <dd className="numeric font-semibold">{formatMAD(data.total)}</dd>
        </div>
        <div className="rounded-xl bg-muted px-3 py-2">
          <dt className="text-caption text-muted-foreground">{C.previous}</dt>
          <dd className="numeric font-semibold">{formatMAD(data.previousTotal)}</dd>
        </div>
      </dl>
      {data.previousTotal === 0 && data.total === 0 ? null : (
        <p className="flex items-center gap-1.5 font-medium">
          <overall.icon className="size-4 shrink-0" aria-hidden />
          {C.delta} : {data.previousTotal === 0 ? C.noPrevious : overall.text}
        </p>
      )}
      {rows.length > 0 ? (
        <ul className="flex flex-col divide-y">
          {rows.map((row) => {
            const change = delta(row.current, row.previous);
            return (
              <li key={row.categoryId} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate">{categories.get(row.categoryId)?.name}</span>
                <span className="flex shrink-0 items-center gap-1 text-caption">
                  <change.icon className="size-3.5" aria-hidden />
                  {change.text}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </SectionCard>
  );
}
