import { ArrowRight, Tag, TrendingDown, TrendingUp } from "lucide-react";
import Link from "@/components/shared/app-link";

import { FinanceChart } from "@/components/admin/finance-chart";
import { SectionHeading } from "@/components/dashboard/section-heading";
import { ROUTES } from "@/lib/auth/routes";
import type { AppLabels } from "@/lib/constants/labels";
import type { FinancialDashboard } from "@/lib/data/finance";
import { formatMAD, formatPercent } from "@/lib/format";
import type { Locale } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";

/** Bloc « Résultat du mois » : encaissé, masse salariale, charges, revenu net et marge, puis 12 mois. */
export function FinanceOverview({ data, LABELS, locale }: { data: FinancialDashboard; LABELS: AppLabels; locale: Locale }) {
  const F = LABELS.financeDashboard;
  const month = data.current;
  const gap = Math.max(0, month.expected - month.collected);
  const positive = month.net >= 0;
  const margin = month.collected > 0 ? month.net / month.collected : null;
  const NetIcon = positive ? TrendingUp : TrendingDown;

  return (
    <section aria-labelledby="resultat" className="flex flex-col gap-3">
      <SectionHeading id="resultat" title={F.title} />
      <div className="grid gap-4 rounded-xl bg-card p-5 shadow-card md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:p-6">
        <dl className="flex flex-col divide-y divide-divider">
          <Row label={F.collected} value={formatMAD(month.collected, locale)} />
          <Row label={F.expected} value={formatMAD(month.expected, locale)} detail={F.unpaid(formatMAD(gap, locale))} />
          <Row
            label={F.payroll}
            value={`− ${formatMAD(month.payroll, locale)}`}
            detail={F.payrollHint}
            link={{ href: ROUTES.admin.payroll, label: F.details.payroll }}
          />
          <Row
            label={F.expenses}
            value={`− ${formatMAD(month.expenses, locale)}`}
            link={{ href: ROUTES.admin.expenses, label: F.details.expenses }}
          />
        </dl>

        <div
          className={cn(
            "flex flex-col justify-center gap-2 rounded-xl px-5 py-4",
            positive ? "bg-success/10" : "bg-danger/10",
          )}
        >
          <p className="text-caption font-medium text-muted-foreground">{F.net}</p>
          <p className={cn("numeric flex items-center gap-2 text-[2.25rem] leading-tight font-bold", positive ? "text-success-ink" : "text-danger-ink")}>
            <NetIcon className="size-8 shrink-0" aria-hidden />
            {formatMAD(month.net, locale)}
          </p>
          <p className={cn("text-caption font-semibold", positive ? "text-success-ink" : "text-danger-ink")}>
            {positive ? F.positive : F.negative}
          </p>
          <p className="text-caption text-muted-foreground">{F.netFormula}</p>
          <div className="mt-2 border-t border-divider pt-2">
            <p className="text-caption text-muted-foreground">{F.margin}</p>
            <p className="numeric text-section text-heading">{margin === null ? "—" : formatPercent(margin, locale)}</p>
            <p className="text-caption text-subtle">{margin === null ? F.marginNone : F.marginHint}</p>
          </div>
        </div>
        <p className="text-caption text-subtle md:col-span-2">{F.scope}</p>
      </div>

      <div className="rounded-xl bg-card p-5 shadow-card md:p-6">
        <h3 className="text-table font-semibold">{F.chart.title}</h3>
        <p className="mb-4 text-caption text-muted-foreground">{F.chart.description}</p>
        <FinanceChart months={data.months} />
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  detail,
  link,
}: {
  label: string;
  value: string;
  detail?: string;
  link?: { href: string; label: string };
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-col">
        <dt className="font-medium">{label}</dt>
        {detail ? <span className="text-caption text-muted-foreground">{detail}</span> : null}
        {link ? (
          <Link href={link.href} className="inline-flex items-center gap-1 text-caption font-medium text-primary hover:underline">
            {link.label}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>
      <dd className="numeric shrink-0 font-semibold">{value}</dd>
    </div>
  );
}

/** Remises du mois : total, élèves concernés, répartition par motif. */
export function DiscountsOverview({ data, LABELS, locale }: { data: FinancialDashboard; LABELS: AppLabels; locale: Locale }) {
  const D = LABELS.financeDashboard.discounts;
  const total = data.current.discounts;

  return (
    <section aria-labelledby="remises-mois" className="flex flex-col gap-3">
      <SectionHeading id="remises-mois" title={D.title} />
      <div className="flex flex-col gap-3 rounded-xl bg-card p-5 shadow-card">
        <p className="text-caption text-muted-foreground">{D.description}</p>
        {total <= 0 ? (
          <p className="text-muted-foreground">{D.empty}</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-highlight/15">
                <Tag className="size-5 text-highlight" aria-hidden />
              </span>
              <div className="flex flex-col">
                <span className="numeric text-section text-heading">{formatMAD(total, locale)}</span>
                <span className="text-caption text-muted-foreground">{D.students(data.current.discountStudents)}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-caption font-medium text-muted-foreground">{D.byReason}</p>
              <ul className="flex flex-col gap-2">
                {data.discountsByReason.map((row) => (
                  <li key={row.reason} className="flex flex-col gap-1">
                    <span className="flex justify-between gap-3 text-caption">
                      <span className="font-medium">{LABELS.discounts.reasonOptions[row.reason]}</span>
                      <span className="numeric">
                        {formatMAD(row.amount, locale)} · {D.students(row.students)}
                      </span>
                    </span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <span className="block h-full rounded-full bg-highlight" style={{ width: `${(row.amount / total) * 100}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
