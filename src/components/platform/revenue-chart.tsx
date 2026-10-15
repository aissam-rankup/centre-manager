"use client";

import { Table2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, type TooltipContentProps, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { formatMAD, formatMonth } from "@/lib/format";
import { useLabels, useLocale } from "@/lib/i18n/client";
import { intlLocale } from "@/lib/i18n/locale";

export type RevenueMonth = { month: string; revenue: number; current: boolean };

const COLOR = "var(--fin-collected)";

/**
 * Revenus encaissés mois par mois sur douze mois : une seule série (aucune
 * légende, le titre la nomme), barres fines arrondies, infobulle au survol
 * et vue tableau.
 */
export function RevenueChart({ months }: { months: RevenueMonth[] }) {
  const C = useLabels().platformConsole.chart;
  const locale = useLocale();
  const [showTable, setShowTable] = useState(false);
  const { monthTick, compact } = useMemo(() => {
    const shortMonth = new Intl.DateTimeFormat(intlLocale(locale), { month: "short" });
    return {
      monthTick: (value: string): string => shortMonth.format(new Date(`${value}T12:00:00`)).replace(".", ""),
      compact: new Intl.NumberFormat(intlLocale(locale), { notation: "compact", maximumFractionDigits: 1 }),
    };
  }, [locale]);
  const rtl = locale === "ar";

  return (
    <div className="flex flex-col gap-4">
      <div className="h-72" aria-hidden={showTable ? undefined : true}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={months} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="month"
              reversed={rtl}
              tickFormatter={monthTick}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              orientation={rtl ? "right" : "left"}
              tickFormatter={(value: number) => compact.format(value)}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip cursor={{ fill: "var(--row-hover)" }} content={RevenueTooltip} />
            <Bar dataKey="revenue" fill={COLOR} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <Button variant="ghost" className="self-start" onClick={() => setShowTable((value) => !value)} aria-expanded={showTable}>
        <Table2 aria-hidden />
        {showTable ? C.hideTable : C.showTable}
      </Button>

      {showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-start">
            <caption className="sr-only">{C.caption}</caption>
            <thead>
              <tr className="h-11 border-b text-caption text-muted-foreground">
                <th scope="col" className="px-2 font-medium">
                  {C.month}
                </th>
                <th scope="col" className="px-2 text-end font-medium">
                  {C.revenue}
                </th>
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map((month) => (
                <tr key={month.month} className="h-11 border-b last:border-b-0">
                  <td className="px-2 capitalize">
                    {formatMonth(month.month, locale)}
                    {month.current ? <span className="ms-2 text-caption text-muted-foreground">({C.currentMonth})</span> : null}
                  </td>
                  <td className="numeric px-2 text-end font-normal">{formatMAD(month.revenue, locale, { cents: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function RevenueTooltip({ active, payload }: TooltipContentProps) {
  const C = useLabels().platformConsole.chart;
  const locale = useLocale();
  const row = payload?.[0]?.payload as RevenueMonth | undefined;
  if (!active || !row) return null;
  return (
    <div className="flex min-w-44 flex-col gap-1 rounded-lg bg-popover px-3 py-2 text-caption text-popover-foreground shadow-raised">
      <p className="font-semibold capitalize">
        {formatMonth(row.month, locale)}
        {row.current ? ` (${C.currentMonth})` : ""}
      </p>
      <p className="flex items-center justify-between gap-4">
        <span>{C.revenue}</span>
        <span className="numeric font-medium">{formatMAD(row.revenue, locale, { cents: true })}</span>
      </p>
    </div>
  );
}
