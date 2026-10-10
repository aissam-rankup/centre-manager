"use client";

import { useRef, useState } from "react";

import { formatPercent } from "@/lib/format";
import { useLabels, useLocale } from "@/lib/i18n/client";
import { type OccupancyCell, type OccupancyReport, occupancyStep } from "@/lib/room-occupancy";
import { cn } from "@/lib/utils";

const STEPS = [0, 1, 2, 3, 4, 5] as const;

function stepStyle(step: number) {
  return step === 0 ? undefined : { background: `var(--occ-${step})`, color: `var(--occ-ink-${step})` };
}

/** Carte de chaleur jour × heure : part des salles occupées ; détail au survol, tableau lisible par les lecteurs d'écran. */
export function OccupancyHeatmap({ report }: { report: OccupancyReport }) {
  const LABELS = useLabels();
  const locale = useLocale();
  const O = LABELS.roomOccupancy;
  const container = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ cell: OccupancyCell; x: number; y: number } | null>(null);
  const cells = new Map(report.cells.map((cell) => [`${cell.day}-${cell.hour}`, cell] as const));
  const describe = (cell: OccupancyCell) =>
    O.cell(LABELS.days[cell.day] ?? "", cell.hour, formatPercent(cell.rate, locale), cell.rooms, report.roomCount);

  return (
    <div ref={container} className="relative flex flex-col gap-3" onPointerLeave={() => setHover(null)}>
      <table className="w-full table-fixed border-separate border-spacing-[3px]">
        <caption className="pb-1 text-left text-caption text-muted-foreground">{O.heatmapCaption}</caption>
        <thead>
          <tr>
            <th scope="col" className="w-10">
              <span className="sr-only">{O.hour}</span>
            </th>
            {report.days.map((day) => (
              <th key={day} scope="col" className="text-caption font-medium text-muted-foreground">
                <abbr title={LABELS.days[day]} className="no-underline">
                  {(LABELS.days[day] ?? "").slice(0, 3)}
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.hours.map((hour) => (
            <tr key={hour}>
              <th scope="row" className="numeric pr-1 text-right text-caption font-medium text-muted-foreground">
                {O.hourLabel(hour)}
              </th>
              {report.days.map((day) => {
                const cell = cells.get(`${day}-${hour}`);
                if (!cell) return <td key={day} />;
                if (!cell.open) {
                  return (
                    <td key={day} className="h-8 rounded-[4px] border border-dashed border-muted-foreground/40">
                      <span className="sr-only">{O.closedCell(LABELS.days[day] ?? "", hour)}</span>
                    </td>
                  );
                }
                const step = occupancyStep(cell.rate);
                return (
                  <td
                    key={day}
                    style={stepStyle(step)}
                    onPointerEnter={(event) => {
                      const box = container.current?.getBoundingClientRect();
                      const rect = event.currentTarget.getBoundingClientRect();
                      if (box) setHover({ cell, x: rect.left - box.left + rect.width / 2, y: rect.top - box.top });
                    }}
                    className={cn(
                      "numeric h-8 rounded-[4px] text-center text-[0.6875rem] leading-none font-semibold",
                      step === 0 && "bg-muted-foreground/15",
                      hover?.cell === cell && "outline-2 outline-offset-1 outline-foreground",
                    )}
                  >
                    <span aria-hidden>{step === 0 ? "" : Math.round(cell.rate * 100)}</span>
                    <span className="sr-only">{describe(cell)}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {hover ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-foreground px-3 py-1.5 text-caption font-medium whitespace-nowrap text-background shadow-lg"
          style={{ left: hover.x, top: hover.y - 6 }}
        >
          {describe(hover.cell)}
        </div>
      ) : null}

      <ul aria-label={O.legend} className="flex flex-wrap gap-x-3 gap-y-1.5">
        {STEPS.map((step) => (
          <li key={step} className="flex items-center gap-1.5 text-caption text-muted-foreground">
            <span className={cn("size-3.5 rounded-[3px]", step === 0 && "bg-muted-foreground/15")} style={stepStyle(step)} aria-hidden />
            {O.legendSteps[step]}
          </li>
        ))}
        <li className="flex items-center gap-1.5 text-caption text-muted-foreground">
          <span className="size-3.5 rounded-[3px] border border-dashed border-muted-foreground/40" aria-hidden />
          {O.closed}
        </li>
      </ul>
    </div>
  );
}
