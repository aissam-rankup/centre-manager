"use client";

import { Table2 } from "lucide-react";
import { useState } from "react";
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
import type { CollectionDay } from "@/lib/data/collection";
import { formatMAD } from "@/lib/format";
import { useLabels } from "@/lib/i18n/client";

// Ce mois-ci : la couleur de l'encaissé ; le mois précédent : référence neutre, en tirets.
const SERIES = [
  { key: "current", color: "var(--fin-collected)", dash: undefined },
  { key: "previous", color: "var(--muted-foreground)", dash: "5 4" },
] as const;

const compact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });

/** Encaissé cumulé jour par jour : ce mois-ci contre le mois précédent, avec le prévisionnel en repère. */
export function CollectionChart({ days, expected }: { days: CollectionDay[]; expected: number }) {
  const LABELS = useLabels();
  const C = LABELS.financeDashboard.collection.chart;
  const [showTable, setShowTable] = useState(false);
  const elapsed = days.filter((day) => day.current !== null);

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-wrap gap-x-5 gap-y-2" aria-label={C.caption}>
        {SERIES.map((series) => (
          <li key={series.key} className="flex items-center gap-2 text-caption text-foreground">
            <svg width="20" height="8" aria-hidden>
              <line x1="0" y1="4" x2="20" y2="4" stroke={series.color} strokeWidth="2" strokeDasharray={series.dash} />
            </svg>
            {C.series[series.key]}
          </li>
        ))}
        {expected > 0 ? (
          <li className="flex items-center gap-2 text-caption text-foreground">
            <svg width="20" height="8" aria-hidden>
              <line x1="0" y1="4" x2="20" y2="4" stroke="var(--border)" strokeWidth="2" />
            </svg>
            {C.expectedLine}
          </li>
        ) : null}
      </ul>

      <div className="h-64" aria-hidden={showTable ? undefined : true}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={days} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="day"
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={16}
            />
            <YAxis
              tickFormatter={(value: number) => compact.format(value)}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={44}
              domain={[0, (max: number) => Math.max(max, expected)]}
            />
            {expected > 0 ? <ReferenceLine y={expected} stroke="var(--border)" strokeWidth={2} /> : null}
            <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }} content={CollectionTooltip} />
            {SERIES.map((series) => (
              <Line
                key={series.key}
                type="linear"
                dataKey={series.key}
                stroke={series.color}
                strokeWidth={2}
                strokeDasharray={series.dash}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)", fill: series.color }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <Button variant="ghost" className="min-h-11 self-start" onClick={() => setShowTable((value) => !value)} aria-expanded={showTable}>
        <Table2 aria-hidden />
        {showTable ? C.hideTable : C.showTable}
      </Button>

      {showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[360px] text-left">
            <caption className="sr-only">{C.caption}</caption>
            <thead>
              <tr className="h-11 border-b text-caption text-muted-foreground">
                <th scope="col" className="px-2 font-medium">{C.day}</th>
                {SERIES.map((series) => (
                  <th key={series.key} scope="col" className="px-2 text-right font-medium">
                    {C.series[series.key]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {elapsed.map((day) => (
                <tr key={day.day} className="h-11 border-b last:border-b-0">
                  <td className="px-2">{day.day}</td>
                  {SERIES.map((series) => (
                    <td key={series.key} className="numeric px-2 text-right font-normal">
                      {day[series.key] === null ? "—" : formatMAD(day[series.key] ?? 0)}
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

function CollectionTooltip({ active, payload }: TooltipContentProps) {
  const LABELS = useLabels();
  const C = LABELS.financeDashboard.collection.chart;
  const row = payload?.[0]?.payload as CollectionDay | undefined;
  if (!active || !row) return null;
  return (
    <div className="flex min-w-44 flex-col gap-1.5 rounded-lg bg-popover px-3 py-2 text-caption text-popover-foreground shadow-raised">
      <p className="font-semibold">{C.dayLabel(row.day)}</p>
      {SERIES.map((series) =>
        row[series.key] === null ? null : (
          <p key={series.key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: series.color }} aria-hidden />
              {C.series[series.key]}
            </span>
            <span className="numeric font-medium">{formatMAD(row[series.key] ?? 0)}</span>
          </p>
        ),
      )}
    </div>
  );
}
