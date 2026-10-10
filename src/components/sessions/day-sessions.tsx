import { AlertTriangle, CalendarOff, ChevronLeft, ChevronRight, ClipboardCheck, DoorOpen, UserRound } from "lucide-react";
import Link from "@/components/shared/app-link";

import { AutoRefresh } from "@/components/sessions/auto-refresh";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DaySession } from "@/lib/data/sessions";
import { formatDateWithWeekday, formatTime } from "@/lib/format";
import { getAppLocale } from "@/lib/i18n/request-locale";
import { getLabels } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

type DaySessionsProps = {
  sessions: DaySession[];
  dateIso: string;
  todayIso: string;
  /** Jour précédent et suivant dans la fenêtre d'appel (null en dehors). */
  previous: string | null;
  next: string | null;
  basePath: string;
  /** Adresse de l'appel d'une séance. */
  sessionHref: (slotId: string, date: string) => string;
};

const STATE_TONE = {
  upcoming: "bg-muted text-muted-foreground",
  ongoing: "bg-primary-soft text-primary",
  done: "bg-success/15 text-success-ink",
} as const;

/** Séances d'un jour : horaire, salle, professeur, avancement de l'appel et qui l'a fait. */
export async function DaySessions({ sessions, dateIso, todayIso, previous, next, basePath, sessionHref }: DaySessionsProps) {
  const LABELS = await getLabels();
  const locale = await getAppLocale();
  const L = LABELS.sessions;
  const dayLabel = formatDateWithWeekday(dateIso, locale);
  const dayHref = (date: string) => (date === todayIso ? basePath : `${basePath}?date=${date}`);

  return (
    <div className="flex flex-col gap-6">
      {dateIso === todayIso ? <AutoRefresh /> : null}
      <PageHeader
        title={L.title}
        description={L.description}
        actions={
          <nav aria-label={L.dayLabel(dayLabel)} className="flex items-center gap-2">
            {previous ? (
              <Button asChild variant="outline" size="icon" aria-label={L.previousDay}>
                <Link href={dayHref(previous)}>
                  <ChevronLeft aria-hidden />
                </Link>
              </Button>
            ) : null}
            <span className="min-w-40 text-center font-medium text-heading first-letter:uppercase">
              {dateIso === todayIso ? L.today : dayLabel}
            </span>
            {next ? (
              <Button asChild variant="outline" size="icon" aria-label={L.nextDay}>
                <Link href={dayHref(next)}>
                  <ChevronRight aria-hidden />
                </Link>
              </Button>
            ) : null}
          </nav>
        }
      />
      <p className="text-caption text-muted-foreground">{L.rangeHint}</p>

      {sessions.length === 0 ? (
        <EmptyState icon={CalendarOff} title={L.emptyTitle} description={L.emptyDescription} />
      ) : (
        <ul className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sessions.map((session) => {
            const complete = session.studentCount > 0 && session.markedCount >= session.studentCount;
            const author =
              session.teacherMarked > 0 && session.staffMarked > 0
                ? L.byBoth
                : session.teacherMarked > 0
                  ? L.byTeacher
                  : session.staffMarked > 0
                    ? L.byStaff
                    : null;
            return (
              <li key={session.slotId} className="flex flex-col gap-4 rounded-xl bg-card p-5 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="numeric text-section text-heading">
                      {session.startTime} – {session.endTime}
                    </span>
                    <span className="truncate font-semibold text-heading">{session.subjectName}</span>
                    <span className="truncate text-caption text-muted-foreground">{session.levelName}</span>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-caption font-medium", STATE_TONE[session.state])}>
                    {L.state[session.state]}
                  </span>
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-divider pt-3 text-caption">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <dt className="sr-only">{LABELS.absencesPage.teacher}</dt>
                    <dd className="truncate">{session.teacherName ?? LABELS.common.none}</dd>
                  </div>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <DoorOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <dt className="sr-only">{LABELS.nav.rooms}</dt>
                    <dd className="truncate">{session.room}</dd>
                  </div>
                </dl>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={complete ? "default" : session.markedCount > 0 ? "secondary" : "outline"}>
                    {session.markedCount > 0 ? L.progress(session.markedCount, session.studentCount) : L.notMarked}
                  </Badge>
                  {session.absentCount > 0 ? <Badge variant="destructive">{L.absents(session.absentCount)}</Badge> : null}
                  {author ? <span className="text-caption text-muted-foreground">{author}</span> : null}
                </div>
                {session.openConflicts > 0 ? (
                  <p className="flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-caption font-medium text-warning-ink">
                    <AlertTriangle className="size-4 shrink-0" aria-hidden />
                    {L.conflicts(session.openConflicts)}
                  </p>
                ) : null}
                {session.lastMarkedAt ? (
                  <p className="text-caption text-subtle">{L.lastMarked(formatTime(session.lastMarkedAt))}</p>
                ) : null}

                <Button asChild variant={session.markedCount > 0 ? "outline" : "default"} className="mt-auto">
                  <Link href={sessionHref(session.slotId, dateIso)}>
                    <ClipboardCheck aria-hidden />
                    {session.markedCount > 0 ? L.edit : L.take}
                  </Link>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
