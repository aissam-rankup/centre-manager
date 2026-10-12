"use client";

import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import type { RevenueKpi } from "@/lib/data/platform";
import { formatDate, formatMAD, formatPercent } from "@/lib/format";
import { useLabels, useLocale } from "@/lib/i18n/client";
import { trendOf } from "@/lib/platform-period";
import { cn } from "@/lib/utils";

const KINDS = ["month", "quarter", "year", "mrr"] as const;

/** Variation écrite en toutes lettres (« Hausse de 1 200,00 MAD (+12,5 %) »), jamais par la couleur seule. */
export function RevenueTrend({
  change,
  ratio,
  comparedWith,
  className,
}: {
  change: number | null;
  ratio: number | null;
  /** « par rapport au … » */
  comparedWith: string | null;
  className?: string;
}) {
  const T = useLabels().platformConsole.trend;
  const locale = useLocale();
  const trend = trendOf(change);
  if (trend === null || change === null) {
    return <p className={`text-caption text-muted-foreground ${className ?? ""}`}>{T.noHistory}</p>;
  }
  const Icon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const sign = trend === "up" ? "+" : trend === "down" ? "−" : "";
  const percent = ratio === null ? null : `${sign}${formatPercent(Math.abs(ratio), locale)}`;
  const text =
    trend === "stable" ? T.stable : T.change(T[trend], formatMAD(Math.abs(change), locale, { cents: true }), percent);
  return (
    <div className={cn("flex flex-col gap-0.5 text-caption", className)}>
      <p
        className={cn(
          "flex items-center gap-1.5 font-medium",
          trend === "up" && "text-success-ink",
          trend === "down" && "text-danger-ink",
          trend === "stable" && "text-muted-foreground",
        )}
      >
        <Icon className="size-4 shrink-0 rtl:-scale-x-100" aria-hidden />
        <span>{text}</span>
      </p>
      {comparedWith ? <p className="text-subtle">{comparedWith}</p> : null}
    </div>
  );
}

/** Quatre indicateurs : mois, trimestre, année en cours et revenu mensuel récurrent. */
export function RevenueKpis({ kpis }: { kpis: RevenueKpi[] }) {
  const LABELS = useLabels();
  const C = LABELS.platformConsole;
  const locale = useLocale();
  const byKind = new Map(kpis.map((kpi) => [kpi.kind, kpi]));

  return (
    <ul className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {KINDS.map((kind) => {
        const kpi = byKind.get(kind);
        if (!kpi) return null;
        const mrr = kind === "mrr";
        const comparedWith = mrr
          ? kpi.previous_start
            ? C.trend.vsDay(formatDate(kpi.previous_start))
            : null
          : kpi.previous_start && kpi.previous_end
            ? C.trend.vsPeriod(formatDate(kpi.previous_start), formatDate(kpi.previous_end))
            : null;
        const noPrevious = !mrr && Number(kpi.previous_value) === 0 && Number(kpi.current_value) === 0;
        return (
          <li key={kind} className="flex flex-col gap-2 rounded-xl bg-card px-6 py-5 shadow-card">
            <p className="text-caption font-medium text-muted-foreground">{C.kpis[kind]}</p>
            <p className="numeric text-stat text-primary">{formatMAD(Number(kpi.current_value ?? 0), locale, { cents: true })}</p>
            <p className="text-caption text-subtle">
              {mrr
                ? C.kpis.mrrDetail
                : kpi.period_start && kpi.period_end
                  ? C.kpis.range(formatDate(kpi.period_start), formatDate(kpi.period_end))
                  : null}
            </p>
            {noPrevious ? (
              <p className="text-caption text-muted-foreground">{C.trend.noPrevious}</p>
            ) : (
              <RevenueTrend
                change={kpi.change_amount === null ? null : Number(kpi.change_amount)}
                ratio={kpi.change_ratio === null ? null : Number(kpi.change_ratio)}
                comparedWith={comparedWith}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
