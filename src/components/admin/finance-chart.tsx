"use client";

import { Table2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import type { FinanceMonth } from "@/lib/data/finance";
import { formatMAD, formatMonth } from "@/lib/format";
import { useLabels, useLocale } from "@/lib/i18n/client";
import { intlLocale } from "@/lib/i18n/locale";

const SERIES = [
  { key: "collected", color: "var(--fin-collected)" },
  { key: "payroll", color: "var(--fin-payroll)" },
  { key: "expenses", color: "var(--fin-expenses)" },
  { key: "net", color: "var(--fin-net)" },
] as const;

/**
 * Résultat mensuel sur douze mois : quatre séries sur un seul axe (MAD),
 * couleurs validées, légende, infobulle au survol et vue tableau.
 */
export function FinanceChart({ months }: { months: FinanceMonth[] }) {
  const LABELS = useLabels();
  const C = LABELS.financeDashboard.chart;
  const locale = useLocale();
  const { monthTick, compact } = useMemo(() => {
    const shortMonth = new Intl.DateTimeFormat(intlLocale(locale), { month: "short" });
    return {
      monthTick: (value: string): string => shortMonth.format(new Date(`${value}T12:00:00`)).replace(".", ""),
      compact: new Intl.NumberFormat(intlLocale(locale), { notation: "compact", maximumFractionDigits: 1 }),
    };
  }, [locale]);
  const [showTable, setShowTable] = useState(false);
  const hasNegative = months.some((month) => month.net < 0);

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-wrap gap-x-5 gap-y-2" aria-label={C.caption}>
        {SERIES.map((series) => (
          <li key={series.key} className="flex items-center gap-2 text-caption text-foreground">
            <span className="relative h-0.5 w-5 rounded-full" style={{ background: series.color }} aria-hidden>
              <span className="absolute top-1/2 left-1/2 size-2 -translate-1/2 rounded-full" style={{ background: series.color }} />
            </span>
            {C.series[series.key]}
          </li>
        ))}
      </ul>

      <div className="h-72" aria-hidden={showTable ? undefined : true}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={months} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="monthStart"
              tickFormatter={monthTick}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={(value: number) => compact.format(value)}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            {hasNegative ? <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="4 4" /> : null}
            <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }} content={FinanceTooltip} />
            {SERIES.map((series) => (
              <Line
                key={series.key}
                type="linear"
                dataKey={series.key}
                stroke={series.color}
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 2, stroke: "var(--card)", fill: series.color }}
                activeDot={{ r: 6, strokeWidth: 2, stroke: "var(--card)", fill: series.color }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="text-caption text-muted-foreground">{C.note}</p>

      <Button variant="ghost" className="self-start" onClick={() => setShowTable((value) => !value)} aria-expanded={showTable}>
        <Table2 aria-hidden />
        {showTable ? C.hideTable : C.showTable}
      </Button>

      {showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <caption className="sr-only">{C.caption}</caption>
            <thead>
              <tr className="h-11 border-b text-caption text-muted-foreground">
                <th scope="col" className="px-2 font-medium">{C.month}</th>
                {SERIES.map((series) => (
                  <th key={series.key} scope="col" className="px-2 text-right font-medium">
                    {C.series[series.key]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map((month) => (
                <tr key={month.monthStart} className="h-11 border-b last:border-b-0">
                  <td className="px-2 capitalize">{formatMonth(month.monthStart, locale)}</td>
                  {SERIES.map((series) => (
                    <td key={series.key} className="numeric px-2 text-right font-normal">
                      {formatMAD(month[series.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function FinanceTooltip({ active, payload }: TooltipContentProps) {
  const LABELS = useLabels();
  const C = LABELS.financeDashboard.chart;
  const locale = useLocale();
  const row = payload?.[0]?.payload as FinanceMonth | undefined;
  if (!active || !row) return null;
  return (
    <div className="flex min-w-48 flex-col gap-1.5 rounded-lg bg-popover px-3 py-2 text-caption text-popover-foreground shadow-raised">
      <p className="font-semibold capitalize">{formatMonth(row.monthStart, locale)}</p>
      {SERIES.map((series) => (
        <p key={series.key} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: series.color }} aria-hidden />
            {C.series[series.key]}
          </span>
          <span className="numeric font-medium">{formatMAD(row[series.key])}</span>
        </p>
      ))}
    </div>
  );
}
