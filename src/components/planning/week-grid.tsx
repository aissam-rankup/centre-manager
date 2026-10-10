"use client";

import { LoaderCircle, MoveRight, TriangleAlert } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import type { DragState, useSlotDrag } from "@/components/planning/use-slot-drag";
import type { PlanningRoom, PlanningSlot } from "@/lib/data/admin";
import { useLabels } from "@/lib/i18n/client";
import { isOverloaded, layoutDay, minutesToTime, type PlanningAxis } from "@/lib/planning-grid";
import { toMinutes } from "@/lib/rooms";
import { cn } from "@/lib/utils";

/** Échelle verticale : 1 h = 54 px. */
export const PX_PER_MINUTE = 0.9;

/** Créneau libre à exploiter, dessiné en pointillés dans la colonne du jour. */
export type FreeBlock = {
  key: string;
  day: number;
  start: number;
  end: number;
  label: string;
  actionLabel: string;
  ariaLabel: string;
  onAction: () => void;
};

type Props = {
  slots: PlanningSlot[];
  days: readonly number[];
  /** Jour affiché sur téléphone (une colonne à la fois). */
  mobileDay: number;
  range: { start: number; end: number };
  /** Dimension déjà donnée par le filtre : inutile de la répéter sur chaque cours. */
  hidden: PlanningAxis | null;
  rooms: ReadonlyMap<string, PlanningRoom>;
  tones: ReadonlyMap<string, string>;
  pendingIds: ReadonlySet<string>;
  drag: DragState | null;
  dragLabel: string | null;
  bind: ReturnType<typeof useSlotDrag>["bind"];
  wrap: (slot: PlanningSlot, trigger: ReactElement) => ReactNode;
  free: readonly FreeBlock[];
};

export function WeekGrid({ slots, days, mobileDay, range, hidden, rooms, tones, pendingIds, drag, dragLabel, bind, wrap, free }: Props) {
  const LABELS = useLabels();
  const G = LABELS.admin.planning.grid;
  const height = (range.end - range.start) * PX_PER_MINUTE;
  const hours: number[] = [];
  for (let minute = range.start; minute <= range.end; minute += 60) hours.push(minute);
  const dragged = drag ? slots.find((slot) => slot.id === drag.slotId) : undefined;

  return (
    <div className="rounded-xl bg-card p-3 shadow-card md:p-4">
      <div className="flex gap-1.5">
        <div className="w-11 shrink-0" aria-hidden />
        {days.map((day) => (
          <div key={day} className={cn("min-w-0 flex-1 pb-2 text-center text-table font-semibold", day !== mobileDay && "hidden md:block")}>
            {LABELS.days[day]}
          </div>
        ))}
      </div>

      <div className="flex gap-1.5">
        {/* Heures */}
        <div className="relative w-11 shrink-0" style={{ height }} aria-hidden>
          {hours.map((minute) => (
            <span
              key={minute}
              className="numeric absolute end-1 -translate-y-1/2 text-caption text-muted-foreground"
              style={{ top: (minute - range.start) * PX_PER_MINUTE }}
            >
              {minutesToTime(minute)}
            </span>
          ))}
        </div>

        {days.map((day) => {
          const blocks = layoutDay(
            slots.filter((slot) => slot.dayOfWeek === day),
            (slot) => [toMinutes(slot.startTime), toMinutes(slot.endTime)] as const,
          );
          const preview =
            drag && dragged && drag.target?.kind === "time" && drag.target.day === day
              ? { top: (drag.target.start - range.start) * PX_PER_MINUTE + 1, height: drag.duration * PX_PER_MINUTE - 2 }
              : null;
          return (
            <section
              key={day}
              aria-label={LABELS.days[day]}
              data-drop-day={day}
              className={cn(
                "relative min-w-0 flex-1 rounded-lg bg-muted/40",
                day !== mobileDay && "hidden md:block",
                drag && "bg-primary-soft/40",
              )}
              style={{ height }}
            >
              {hours.map((minute) => (
                <div
                  key={minute}
                  className="pointer-events-none absolute inset-x-0 border-t border-divider"
                  style={{ top: (minute - range.start) * PX_PER_MINUTE }}
                  aria-hidden
                />
              ))}

              {free
                .filter((block) => block.day === day)
                .map((block) => (
                  <button
                    key={block.key}
                    type="button"
                    onClick={block.onAction}
                    aria-label={block.ariaLabel}
                    title={block.ariaLabel}
                    className="absolute inset-x-0.5 flex flex-col items-start gap-1 overflow-hidden rounded-lg border-2 border-dashed border-success/60 bg-success/5 p-1.5 text-start transition-colors hover:bg-success/15"
                    style={{ top: (block.start - range.start) * PX_PER_MINUTE + 1, height: (block.end - block.start) * PX_PER_MINUTE - 2 }}
                  >
                    <span className="line-clamp-2 text-caption leading-tight font-medium text-success-ink">{block.label}</span>
                    <span className="inline-flex items-center gap-1 text-caption leading-tight font-semibold text-success-ink underline-offset-2">
                      <MoveRight className="size-3.5 shrink-0" aria-hidden />
                      {block.actionLabel}
                    </span>
                  </button>
                ))}

              {blocks.map(({ item: slot, start, end, column, columns }) => {
                const overloaded = isOverloaded(slot, rooms);
                const capacity = rooms.get(slot.roomId)?.capacity ?? null;
                const compact = (end - start) * PX_PER_MINUTE < 64;
                const details = [
                  hidden === "level" ? null : slot.levelName,
                  hidden === "teacher" ? null : slot.teacherName,
                  hidden === "room" ? null : slot.room,
                ].filter(Boolean);
                const trigger = (
                  <button
                    type="button"
                    {...bind({ id: slot.id, start, end })}
                    aria-label={`${LABELS.admin.planning.editSlot} — ${slot.subjectName}, ${LABELS.days[slot.dayOfWeek]} ${slot.startTime}`}
                    title={[
                      `${slot.subjectName} · ${LABELS.teacher.schedule.time(slot.startTime, slot.endTime)}`,
                      [slot.levelName, slot.teacherName, slot.room].join(" · "),
                      overloaded && capacity !== null ? G.overloaded(slot.enrolled, capacity) : null,
                    ]
                      .filter(Boolean)
                      .join("\n")}
                    className={cn(
                      "absolute flex touch-manipulation flex-col gap-0.5 overflow-hidden rounded-lg px-2 py-1.5 text-start text-white shadow-card transition-opacity select-none",
                      "cursor-grab focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none active:cursor-grabbing",
                      tones.get(slot.subjectId),
                      overloaded && "ring-2 ring-danger ring-offset-1 ring-offset-card",
                      (drag?.slotId === slot.id || pendingIds.has(slot.id)) && "opacity-50",
                    )}
                    style={{
                      top: (start - range.start) * PX_PER_MINUTE + 1,
                      height: (end - start) * PX_PER_MINUTE - 2,
                      left: `calc(${(column / columns) * 100}% + 2px)`,
                      width: `calc(${100 / columns}% - 4px)`,
                    }}
                  >
                    <span className="numeric flex items-center gap-1 text-caption leading-tight font-medium">
                      {pendingIds.has(slot.id) ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : null}
                      {LABELS.teacher.schedule.time(slot.startTime, slot.endTime)}
                      {overloaded ? <TriangleAlert className="ms-auto size-3.5 shrink-0" aria-label={G.overloadedShort} /> : null}
                    </span>
                    <span className="truncate text-table leading-tight font-semibold">{slot.subjectName}</span>
                    {compact ? null : <span className="line-clamp-2 text-caption leading-tight text-white/85">{details.join(" · ")}</span>}
                    {overloaded && !compact && capacity !== null ? (
                      <span className="numeric truncate text-caption leading-tight font-semibold">{G.overloaded(slot.enrolled, capacity)}</span>
                    ) : null}
                  </button>
                );
                return <div key={slot.id}>{wrap(slot, trigger)}</div>;
              })}

              {preview ? (
                <div
                  className="pointer-events-none absolute inset-x-0.5 z-10 rounded-lg border-2 border-dashed border-primary bg-primary/10"
                  style={preview}
                  aria-hidden
                />
              ) : null}
            </section>
          );
        })}
      </div>

      {drag && dragged && dragLabel ? (
        <div
          className="pointer-events-none fixed z-50 rounded-lg bg-foreground px-3 py-1.5 text-caption font-semibold text-background shadow-lg"
          style={{ left: drag.x + 14, top: drag.y + 14 }}
          aria-hidden
        >
          {dragged.subjectName} · {dragLabel}
        </div>
      ) : null}
    </div>
  );
}
