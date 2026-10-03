import { FileDown, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { FilterChips } from "@/components/admin/filter-chips";
import { CorrectCashSessionButton, ValidateCashSessionButton } from "@/components/cash/cash-admin-actions";
import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/auth/routes";
import type { AppLabels } from "@/lib/constants/labels";
import type { CashHistoryRow, CashMonthOverview } from "@/lib/data/cash";
import { formatDate, formatMAD, formatMonth, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/** « 2026-10 » → { year, month } ; mois impossible ou année hors 2000-2100 : le mois en cours. */
export function parseMonthParam(value: string | undefined, todayIso: string): { year: number; month: number } {
  const match = value && /^(\d{4})-(\d{2})$/.exec(value);
  const [year = 0, month = 1] = (match ? `${match[1]}-${match[2]}` : todayIso.slice(0, 7)).split("-").map(Number);
  return month >= 1 && month <= 12 && year >= 2000 && year <= 2100
    ? { year, month }
    : { year: Number(todayIso.slice(0, 4)), month: Number(todayIso.slice(5, 7)) };
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Six derniers mois, du plus récent au plus ancien. */
function recentMonths(todayIso: string): { year: number; month: number }[] {
  const [year = 0, month = 1] = todayIso.split("-").map(Number);
  return Array.from({ length: 6 }, (_, index) => {
    const total = year * 12 + (month - 1) - index;
    return { year: Math.floor(total / 12), month: (total % 12) + 1 };
  });
}

function VarianceText({ variance, LABELS }: { variance: number | null; LABELS: AppLabels }) {
  const C = LABELS.cash;
  if (variance === null) return <span className="text-muted-foreground">{LABELS.common.none}</span>;
  return (
    <span className={cn("font-semibold", variance === 0 ? "text-success-ink" : "text-danger-ink")}>
      {variance === 0 ? C.variance.none : variance < 0 ? C.variance.shortage(formatMAD(-variance)) : C.variance.surplus(formatMAD(variance))}
    </span>
  );
}

/** Historique des sessions du mois, indicateurs d'écart, actions de l'admin. */
export function CashHistory({
  rows,
  overview,
  month,
  todayIso,
  LABELS,
}: {
  rows: CashHistoryRow[];
  overview: CashMonthOverview;
  month: { year: number; month: number };
  todayIso: string;
  LABELS: AppLabels;
}) {
  const C = LABELS.cash;
  const A = C.admin;
  const exactRate = overview.sessions > 0 ? overview.exact / overview.sessions : null;

  return (
    <SectionCard title={A.historyTitle} description={A.historyDescription}>
      <FilterChips
        label={A.monthsLabel}
        options={recentMonths(todayIso).map((item) => ({
          value: monthKey(item.year, item.month),
          label: A.month(formatMonth(`${monthKey(item.year, item.month)}-01`)),
        }))}
        current={monthKey(month.year, month.month)}
        href={(value) => (value ? `${ROUTES.admin.cash}?mois=${value}` : ROUTES.admin.cash)}
      />

      <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="flex flex-col rounded-lg bg-danger/10 px-3 py-2">
          <dt className="text-caption text-muted-foreground">{A.indicators.shortage}</dt>
          <dd className="numeric font-semibold text-danger-ink">{formatMAD(Math.abs(overview.shortage))}</dd>
        </div>
        <div className="flex flex-col rounded-lg bg-warning/10 px-3 py-2">
          <dt className="text-caption text-muted-foreground">{A.indicators.surplus}</dt>
          <dd className="numeric font-semibold text-warning-ink">{formatMAD(overview.surplus)}</dd>
        </div>
        <div className="flex flex-col rounded-lg bg-success/10 px-3 py-2">
          <dt className="text-caption text-muted-foreground">{A.indicators.exact}</dt>
          <dd className="numeric font-semibold text-success-ink">{exactRate === null ? LABELS.common.none : formatPercent(exactRate)}</dd>
          <dd className="text-caption text-muted-foreground">{A.indicators.exactHint(overview.exact, overview.sessions)}</dd>
        </div>
        <div className="flex flex-col rounded-lg bg-muted px-3 py-2">
          <dt className="text-caption text-muted-foreground">{A.indicators.collected}</dt>
          <dd className="numeric font-semibold">{formatMAD(overview.collected)}</dd>
          <dd className="text-caption text-muted-foreground">{A.indicators.validated(overview.validated)}</dd>
        </div>
      </dl>
      <p className="text-caption text-muted-foreground">{A.indicators.net(formatMAD(overview.net))}</p>

      {overview.people.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold">{A.peopleTitle}</h3>
          <p className="text-caption text-muted-foreground">{A.peopleDescription}</p>
          <ul className="flex flex-col divide-y divide-divider">
            {overview.people.map((person) => {
              // Au moins deux écarts dans le même sens : un signal à traiter (un excédent ne masque pas des manquants).
              const repeated = person.shortCount >= 2 || person.surplusCount >= 2;
              return (
                <li key={person.name ?? "inconnu"} className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{person.name ?? A.unknownPerson}</span>
                    <span className="text-caption text-muted-foreground">
                      {A.personLine(person.sessions, person.shortCount, person.surplusCount)}
                    </span>
                    {repeated ? (
                      <span className="inline-flex items-center gap-1 text-caption font-medium text-danger-ink">
                        <TriangleAlert className="size-3.5" aria-hidden />
                        {A.repeated}
                      </span>
                    ) : null}
                  </span>
                  {/* Manquants et excédents séparés : ils ne se compensent pas. */}
                  <span className="flex flex-col items-end">
                    {person.shortCount + person.surplusCount === 0 ? <VarianceText variance={0} LABELS={LABELS} /> : null}
                    {person.shortCount > 0 ? <VarianceText variance={person.shortage} LABELS={LABELS} /> : null}
                    {person.surplusCount > 0 ? <VarianceText variance={person.surplus} LABELS={LABELS} /> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-xl bg-muted px-4 py-6 text-center text-muted-foreground">{A.empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-3 rounded-xl border px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <Link href={`${ROUTES.admin.cash}/${row.id}`} className="font-semibold hover:text-primary">
                    {C.sessionOf(formatDate(row.sessionDate))} · {row.isShared ? C.shared : C.personal(row.holderName)}
                  </Link>
                  <span className="text-caption text-muted-foreground">
                    {C.status[row.status]}
                    {row.closedByName ? ` · ${row.closedByName}` : ""}
                    {row.validatedByName ? ` · ${row.validatedByName}` : ""}
                  </span>
                </div>
                <VarianceText variance={row.variance} LABELS={LABELS} />
              </div>
              <dl className="grid grid-cols-3 gap-2 text-caption">
                <div className="flex flex-col">
                  <dt className="text-muted-foreground">{A.columns.collected}</dt>
                  <dd className="numeric font-semibold">{formatMAD(row.totalCollected)}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-muted-foreground">{A.columns.expected}</dt>
                  <dd className="numeric font-semibold">{formatMAD(row.expectedCash)}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-muted-foreground">{A.columns.counted}</dt>
                  <dd className="numeric font-semibold">{row.countedCash === null ? LABELS.common.none : formatMAD(row.countedCash)}</dd>
                </div>
              </dl>
              {row.varianceReason ? <p className="text-caption">{row.varianceReason}</p> : null}
              {row.corrections !== 0 ? <p className="text-caption text-muted-foreground">{A.corrections(formatMAD(row.corrections))}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="ghost" className="min-h-11">
                  <Link href={`${ROUTES.admin.cash}/${row.id}`}>{A.open}</Link>
                </Button>
                <Button asChild variant="ghost" className="min-h-11">
                  <a href={`${ROUTES.admin.cash}/rapport/${row.sessionDate}`} target="_blank" rel="noopener">
                    <FileDown aria-hidden />
                    {A.report}
                  </a>
                </Button>
                {row.status === "closed" ? (
                  <>
                    <CorrectCashSessionButton sessionId={row.id} corrected={row.corrections} />
                    <ValidateCashSessionButton sessionId={row.id} />
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
