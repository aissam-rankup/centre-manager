import { CalendarOff, Clock, DoorOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { ROUTES } from "@/lib/auth/routes";
import { LABELS } from "@/lib/constants/labels";
import { getTeacherSlots, type TeacherSlot, todayDayOfWeek } from "@/lib/data/teacher";
import { cn } from "@/lib/utils";

const L = LABELS.teacher.schedule;

export const metadata: Metadata = { title: L.title };

/** Semaine du lundi au samedi ; le dimanche n'apparaît que s'il porte des séances. */
const WEEK = [1, 2, 3, 4, 5, 6] as const;

export default async function TeacherSchedulePage() {
  const slots = await getTeacherSlots();
  const today = todayDayOfWeek();
  const days: number[] = slots.some((slot) => slot.dayOfWeek === 0) ? [...WEEK, 0] : [...WEEK];
  const byDay = new Map(days.map((day) => [day, slots.filter((slot) => slot.dayOfWeek === day)]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={L.title} description={L.description} />

      {slots.length === 0 ? (
        <EmptyState icon={CalendarOff} title={L.emptyTitle} description={L.emptyDescription} />
      ) : (
        <>
          {/* Mobile : liste par jour */}
          <div className="flex flex-col gap-4 lg:hidden">
            {days.map((day) => (
              <section key={day} aria-labelledby={`jour-${day}`} className="flex flex-col gap-2">
                <DayHeading day={day} isToday={day === today} id={`jour-${day}`} />
                {(byDay.get(day) ?? []).length === 0 ? (
                  <p className="rounded-[10px] border border-dashed px-4 py-3 text-caption text-muted-foreground">
                    {L.noSession}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {(byDay.get(day) ?? []).map((slot) => (
                      <li key={slot.id}>
                        <SlotCard slot={slot} isToday={day === today} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          {/* Desktop : grille hebdomadaire */}
          <div
            className="hidden gap-3 lg:grid"
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
            role="table"
            aria-label={L.title}
          >
            <div role="rowgroup" className="contents">
              <div role="row" className="contents">
                {days.map((day) => (
                  <div key={day} role="columnheader">
                    <DayHeading day={day} isToday={day === today} />
                  </div>
                ))}
              </div>
            </div>
            <div role="rowgroup" className="contents">
              <div role="row" className="contents">
                {days.map((day) => (
                  <div
                    key={day}
                    role="cell"
                    className={cn(
                      "flex min-h-40 flex-col gap-2 rounded-xl p-2",
                      day === today ? "bg-brand/5 ring-1 ring-brand/30" : "bg-muted/50",
                    )}
                  >
                    {(byDay.get(day) ?? []).length === 0 ? (
                      <p className="p-2 text-caption text-muted-foreground">{L.noSession}</p>
                    ) : (
                      (byDay.get(day) ?? []).map((slot) => <SlotCard key={slot.id} slot={slot} isToday={day === today} compact />)
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DayHeading({ day, isToday, id }: { day: number; isToday: boolean; id?: string }) {
  return (
    <h2 id={id} className="flex items-center gap-2 text-body font-semibold">
      {LABELS.days[day]}
      {isToday ? (
        <span className="rounded-full bg-brand/10 px-2 py-0.5 text-caption font-medium text-brand-ink">{L.today}</span>
      ) : null}
    </h2>
  );
}

function SlotCard({ slot, isToday, compact = false }: { slot: TeacherSlot; isToday: boolean; compact?: boolean }) {
  const content = (
    <>
      <p className="numeric flex items-center gap-1.5 text-caption text-brand-ink">
        <Clock className="size-4" aria-hidden />
        {L.time(slot.startTime, slot.endTime)}
      </p>
      <p className="font-semibold">{slot.subjectName}</p>
      <p className="text-caption text-muted-foreground">{slot.levelName}</p>
      <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
        <DoorOpen className="size-4" aria-hidden />
        {slot.room}
      </p>
    </>
  );

  const className = cn(
    "flex flex-col gap-1 rounded-[10px] border bg-card shadow-soft",
    compact ? "p-3" : "p-4",
    isToday && "border-l-4 border-l-brand",
  );

  // Les séances du jour ouvrent directement l'appel.
  return isToday ? (
    <Link href={ROUTES.teacher.call(slot.id)} className={cn(className, "transition-colors hover:bg-muted/60")}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}
