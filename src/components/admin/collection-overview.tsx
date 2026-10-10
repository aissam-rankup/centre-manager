import { ArrowRight, TriangleAlert } from "lucide-react";
import Link from "@/components/shared/app-link";

import { CollectionChart } from "@/components/admin/collection-chart";
import { SectionHeading } from "@/components/dashboard/section-heading";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/auth/routes";
import type { AppLabels } from "@/lib/constants/labels";
import type { CollectionOverview, ReenrollmentOverview } from "@/lib/data/collection";
import { formatMAD, formatMonth, formatPercent } from "@/lib/format";
import type { Locale } from "@/lib/i18n/locale";
import { isoDate } from "@/lib/reenrollment";
import { cn } from "@/lib/utils";

/** Recouvrement du mois : prévisionnel, encaissé à ce jour, reste, taux, puis courbe comparée au mois précédent. */
export function CollectionOverviewSection({ data, LABELS, locale }: { data: CollectionOverview; LABELS: AppLabels; locale: Locale }) {
  const C = LABELS.financeDashboard.collection;
  const remaining = Math.max(0, data.expected - data.collected);
  const rate = data.expected > 0 ? data.collected / data.expected : null;
  const previousRate = data.previous.expected > 0 ? data.previous.collectedSameDay / data.previous.expected : null;

  return (
    <section aria-labelledby="recouvrement" className="flex flex-col gap-3">
      <SectionHeading id="recouvrement" title={C.title} />
      <div className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-card md:p-6">
        <p className="text-caption text-muted-foreground">{C.description(formatMonth(data.monthStart, locale))}</p>
        <dl className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <Kpi label={C.expected} value={formatMAD(data.expected)} detail={C.expectedHint(data.invoices)} />
          <Kpi label={C.collected} value={formatMAD(data.collected)} detail={C.collectedHint(data.paidInvoices, data.invoices)} />
          <Kpi label={C.remaining} value={formatMAD(remaining)} />
          <Kpi
            label={C.rate}
            value={rate === null ? "—" : formatPercent(rate)}
            detail={rate === null ? C.rateNone : undefined}
            emphasis
          />
        </dl>
        {rate !== null && previousRate !== null ? (
          <p className="text-caption text-muted-foreground">{C.comparison(formatPercent(rate), formatPercent(previousRate))}</p>
        ) : previousRate === null ? (
          <p className="text-caption text-muted-foreground">{C.comparisonNone}</p>
        ) : null}
        <div className="flex flex-col gap-1 border-t border-divider pt-4">
          <h3 className="text-table font-semibold">{C.chart.title}</h3>
          <p className="mb-2 text-caption text-muted-foreground">{C.chart.description}</p>
          <CollectionChart days={data.days} expected={data.expected} />
        </div>
      </div>
    </section>
  );
}

function Kpi({ label, value, detail, emphasis = false }: { label: string; value: string; detail?: string; emphasis?: boolean }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 rounded-lg px-3 py-2", emphasis ? "bg-primary-soft" : "bg-muted")}>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="numeric text-lg leading-7 font-semibold text-heading">{value}</dd>
      {detail ? <dd className="text-caption text-muted-foreground">{detail}</dd> : null}
    </div>
  );
}

/** Réinscription : reconduits, abandons, pauses, et par matière ou pack. */
export function ReenrollmentOverviewCard({ data, LABELS, locale }: { data: ReenrollmentOverview; LABELS: AppLabels; locale: Locale }) {
  const D = LABELS.reenrollment.dashboard;
  const month = formatMonth(isoDate(data.year, data.month, 1), locale);
  const counts = [
    { key: "confirmed", value: data.confirmed, tone: "text-success-ink" },
    { key: "dropped", value: data.dropped, tone: "text-danger-ink" },
    { key: "paused", value: data.paused, tone: "text-warning-ink" },
    { key: "pending", value: data.pending, tone: "text-muted-foreground" },
  ] as const;
  const maxTotal = Math.max(1, ...data.subjects.map((subject) => subject.kept + subject.dropped));

  return (
    <section aria-labelledby="reinscription" className="flex flex-col gap-3">
      <SectionHeading id="reinscription" title={D.title} href={`${ROUTES.admin.reenrollment}?campagne=${data.runId}`} />
      <div className="flex flex-col gap-4 rounded-xl bg-card p-5 shadow-card">
        <p className="text-caption text-muted-foreground">{D.campaign(month, LABELS.reenrollment.review.status[data.status])}</p>
        <dl className="grid grid-cols-2 gap-3">
          {counts
            .filter((count) => count.key !== "pending" || count.value > 0)
            .map((count) => (
              <div key={count.key} className="flex flex-col">
                <dt className="text-caption text-muted-foreground">{D.counts[count.key]}</dt>
                <dd className={cn("numeric text-section", count.tone)}>{count.value}</dd>
              </div>
            ))}
        </dl>
        {data.subjectsRemoved > 0 ? <p className="text-caption text-muted-foreground">{D.removed(data.subjectsRemoved)}</p> : null}
        {data.subjects.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-caption font-medium text-muted-foreground">{D.bySubject}</p>
            <ul className="flex flex-col gap-2">
              {data.subjects.map((subject) => (
                <li key={`${subject.kind}:${subject.name}`} className="flex flex-col gap-1">
                  <span className="flex justify-between gap-3 text-caption">
                    <span className="font-medium">
                      {subject.name}
                      {subject.kind === "pack" ? <span className="ml-1 text-muted-foreground">({D.pack})</span> : null}
                    </span>
                    <span className="numeric">{D.subjectLine(subject.kept, subject.dropped)}</span>
                  </span>
                  <span className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span className="block h-full rounded-full bg-success" style={{ width: `${(subject.kept / maxTotal) * 100}%` }} />
                    {subject.dropped > 0 ? (
                      <span className="block h-full rounded-full bg-danger" style={{ width: `${(subject.dropped / maxTotal) * 100}%` }} />
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <Link
          href={`${ROUTES.admin.reenrollment}?campagne=${data.runId}`}
          className="inline-flex min-h-11 items-center gap-1 self-start text-caption font-medium text-primary hover:underline"
        >
          {D.open}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

/** Mois commencé sans campagne confirmée : les factures attendent. */
export function LateDraftBanner({
  draft,
  LABELS,
  locale,
}: {
  draft: { id: string; year: number; month: number };
  LABELS: AppLabels;
  locale: Locale;
}) {
  const D = LABELS.reenrollment.dashboard;
  return (
    <div role="status" className="flex flex-col gap-3 rounded-xl bg-warning/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-ink" aria-hidden />
        {D.lateDraft(formatMonth(isoDate(draft.year, draft.month, 1), locale))}
      </p>
      <Button asChild variant="outline" className="min-h-11 self-start sm:self-auto">
        <Link href={`${ROUTES.admin.reenrollment}?campagne=${draft.id}`}>{D.lateDraftAction}</Link>
      </Button>
    </div>
  );
}
