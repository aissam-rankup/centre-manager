import { CalendarOff, Clock, DoorOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/components/shared/app-link";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { subjectTones } from "@/components/dashboard/progress-tile";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole } from "@/lib/auth/session";
import { getLabels } from "@/lib/i18n/server";
import { getTeacherSlots, type TeacherSlot, todayDayOfWeek } from "@/lib/data/teacher";
import { cn } from "@/lib/utils";


export async function generateMetadata(): Promise<Metadata> {
  const LABELS = await getLabels();
  const L = LABELS.teacher.schedule;
  return { title: L.title };
}

/** Semaine du lundi au samedi ; le dimanche n'apparaît que s'il porte des séances. */
const WEEK = [1, 2, 3, 4, 5, 6] as const;

export default async function TeacherSchedulePage() {
  const LABELS = await getLabels();
  const L = LABELS.teacher.schedule;
  const [profile, slots] = await Promise.all([requireRole("teacher"), getTeacherSlots()]);
  const teacher: SlotTeacher = { name: profile.fullName, photoUrl: profile.photoUrl };
  const tones = subjectTones(slots.map((slot) => slot.subjectId));
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
                  <p className="rounded-lg border border-dashed px-4 py-3 text-caption text-muted-foreground">
                    {L.noSession}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {(byDay.get(day) ?? []).map((slot) => (
                      <li key={slot.id}>
                        <SlotCard teacher={teacher} tone={tones.get(slot.subjectId) ?? ""} slot={slot} isToday={day === today} />
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
                      (byDay.get(day) ?? []).map((slot) => <SlotCard key={slot.id} teacher={teacher} tone={tones.get(slot.subjectId) ?? ""} slot={slot} isToday={day === today} compact />)
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

async function DayHeading({ day, isToday, id }: { day: number; isToday: boolean; id?: string }) {
  const LABELS = await getLabels();
  const L = LABELS.teacher.schedule;
  return (
    <h2 id={id} className="flex items-center gap-2 text-body font-semibold">
      {LABELS.days[day]}
      {isToday ? (
        <span className="rounded-full bg-brand/10 px-2 py-0.5 text-caption font-medium text-brand-ink">{L.today}</span>
      ) : null}
    </h2>
  );
}

type SlotTeacher = { name: string; photoUrl: string | null };

async function SlotCard({
  slot,
  teacher,
  tone,
  isToday,
  compact = false,
}: {
  slot: TeacherSlot;
  teacher: SlotTeacher;
  /** Classe de fond de la matière (bg-tile-n). */
  tone: string;
  isToday: boolean;
  compact?: boolean;
}) {
  const LABELS = await getLabels();
  const L = LABELS.teacher.schedule;
  const content = (
    <>
      <p className="numeric flex items-center gap-1.5 text-caption font-medium">
        <Clock className="size-4" aria-hidden />
        {L.time(slot.startTime, slot.endTime)}
      </p>
      <p className="font-semibold">{slot.subjectName}</p>
      <p className="text-caption text-white/85">{slot.levelName}</p>
      <p className="flex items-center gap-1.5 text-caption text-white/85">
        <StudentAvatar name={teacher.name} photoUrl={teacher.photoUrl} size="mini" className="border-white/60" />
        <span className="truncate">{teacher.name}</span>
      </p>
      <p className="flex items-center gap-1.5 text-caption text-white/85">
        <DoorOpen className="size-4" aria-hidden />
        {slot.room}
      </p>
    </>
  );

  const className = cn(
    "flex flex-col gap-1 rounded-xl text-white shadow-card",
    tone,
    compact ? "p-3" : "p-4",
    // Séance du jour : liseré violet autour de la carte (en plus du libellé « Aujourd'hui »).
    isToday && "ring-2 ring-primary ring-offset-2 ring-offset-background",
  );

  // Les séances du jour ouvrent directement l'appel.
  return isToday ? (
    <Link href={ROUTES.teacher.call(slot.id)} className={cn(className, "card-interactive")}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}
