"use client";

import { Table2 } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, type TooltipContentProps, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { LABELS } from "@/lib/constants/labels";
import type { AbsenceRate } from "@/lib/data/admin";
import { formatPercent } from "@/lib/format";

const L = LABELS.admin.dashboard.chart;

/** Hauteur par barre : barres fines, étiquettes lisibles. */
const ROW_HEIGHT = 44;

type ChartRow = AbsenceRate & { label: string };

/**
 * Taux d'absence par matière : barres horizontales, une seule série
 * (une seule couleur validée, pas de légende), infobulle au survol et vue tableau.
 */
export function AbsenceChart({ rates }: { rates: AbsenceRate[] }) {
  const [showTable, setShowTable] = useState(false);
  const data: ChartRow[] = rates.map((rate) => ({ ...rate, label: `${rate.subjectName} · ${rate.levelName}` }));
  const max = Math.max(0.1, ...rates.map((rate) => rate.rate));

  return (
    <div className="flex flex-col gap-4">
      <div style={{ height: data.length * ROW_HEIGHT + 32 }} aria-hidden={showTable ? undefined : true}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={12}>
            <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="0" />
            <XAxis
              type="number"
              domain={[0, Math.min(1, Math.ceil(max * 10) / 10)]}
              tickFormatter={(value: number) => formatPercent(value)}
              tick={{ fill: "var(--muted-foreground)", fontSize: 13 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={180}
              tick={{ fill: "var(--foreground)", fontSize: 13 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip cursor={{ fill: "var(--muted)" }} content={ChartTooltip} />
            <Bar dataKey="rate" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <Button variant="ghost" className="self-start" onClick={() => setShowTable((value) => !value)} aria-expanded={showTable}>
        <Table2 aria-hidden />
        {showTable ? L.hideTable : L.showTable}
      </Button>

      {showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <caption className="sr-only">{L.caption}</caption>
            <thead>
              <tr className="h-11 border-b text-caption text-muted-foreground">
                <th scope="col" className="px-2 font-medium">{L.subject}</th>
                <th scope="col" className="px-2 font-medium">{L.level}</th>
                <th scope="col" className="px-2 text-right font-medium">{L.absences}</th>
                <th scope="col" className="px-2 text-right font-medium">{L.records}</th>
                <th scope="col" className="px-2 text-right font-medium">{L.rate}</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((rate) => (
                <tr key={rate.subjectId} className="h-[52px] border-b last:border-b-0">
                  <td className="px-2">{rate.subjectName}</td>
                  <td className="px-2 text-muted-foreground">{rate.levelName}</td>
                  <td className="numeric px-2 text-right font-normal">{rate.absentCount}</td>
                  <td className="numeric px-2 text-right font-normal">{rate.totalCount}</td>
                  <td className="numeric px-2 text-right">{formatPercent(rate.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function ChartTooltip({ active, payload }: TooltipContentProps) {
  const row = payload?.[0]?.payload as ChartRow | undefined;
  if (!active || !row) return null;
  return (
    <div className="rounded-[10px] border bg-popover px-3 py-2 text-popover-foreground shadow-raised">
      <p className="font-medium">{row.label}</p>
      <p className="numeric text-lg">{formatPercent(row.rate)}</p>
      <p className="text-caption text-muted-foreground">{L.tooltip(row.absentCount, row.totalCount)}</p>
    </div>
  );
}
