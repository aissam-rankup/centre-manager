import { CalendarDays, CalendarOff, ClipboardCheck, Clock, DoorOpen, PencilLine, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole } from "@/lib/auth/session";
import { LABELS } from "@/lib/constants/labels";
import { getTodaySessions, type TodaySession } from "@/lib/data/teacher";
import { formatDateWithWeekday, today } from "@/lib/format";
import { cn } from "@/lib/utils";

const L = LABELS.teacher.home;

export const metadata: Metadata = { title: L.title };

export default async function TeacherHomePage() {
  const profile = await requireRole("teacher");
  const sessions = await getTodaySessions();
  const dateLabel = formatDateWithWeekday(today());
  const firstName = profile.fullName.split(" ")[0] ?? profile.fullName;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={L.greeting(firstName)} description={dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)} />

      <section aria-labelledby="seances-titre" className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="seances-titre" className="text-section">
            {L.todaySessions}
          </h2>
          <span className="text-caption text-muted-foreground">{L.sessionsCount(sessions.length)}</span>
        </div>

        {sessions.length === 0 ? (
          <EmptyState
            icon={CalendarOff}
            title={L.emptyTitle}
            description={L.emptyDescription}
            action={
              <Button asChild variant="outline">
                <Link href={ROUTES.teacher.schedule}>
                  <CalendarDays aria-hidden />
                  {L.seeSchedule}
                </Link>
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {sessions.map((session, index) => (
              <SessionCard key={session.id} session={session} highlighted={index === firstTodo(sessions)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Première séance dont l'appel reste à faire : c'est la seule mise en avant (ambre). */
function firstTodo(sessions: TodaySession[]): number {
  return sessions.findIndex((session) => session.studentCount > 0 && session.markedCount < session.studentCount);
}

function SessionCard({ session, highlighted }: { session: TodaySession; highlighted: boolean }) {
  const done = session.studentCount > 0 && session.markedCount >= session.studentCount;
  const partial = session.markedCount > 0 && !done;

  return (
    <li>
      <Card className={cn("h-full", highlighted && "border-highlight")}>
        <CardContent className="flex h-full flex-col gap-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="text-section">{session.subjectName}</h3>
              <p className="text-muted-foreground">{session.levelName}</p>
            </div>
            <AttendanceBadge done={done} partial={partial} session={session} />
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-2 text-caption">
            <Detail icon={Clock} label={LABELS.teacher.schedule.time(session.startTime, session.endTime)} />
            <Detail icon={DoorOpen} label={session.room} />
            <Detail icon={Users} label={L.studentsCount(session.studentCount)} />
          </div>

          <Button
            asChild
            size="call"
            variant={done ? "outline" : highlighted ? "highlight" : "default"}
            className="mt-auto w-full"
          >
            <Link href={ROUTES.teacher.call(session.id)}>
              {done ? <PencilLine aria-hidden /> : <ClipboardCheck aria-hidden />}
              {done ? L.editAttendance : L.takeAttendance}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </li>
  );
}

function Detail({ icon: Icon, label }: { icon: typeof Clock; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground">
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="numeric font-normal whitespace-nowrap">{label}</span>
    </div>
  );
}

function AttendanceBadge({ done, partial, session }: { done: boolean; partial: boolean; session: TodaySession }) {
  const label = done
    ? L.attendanceDone
    : partial
      ? L.attendancePartial(session.markedCount, session.studentCount)
      : L.attendanceTodo;
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-caption font-medium whitespace-nowrap",
        done ? "bg-success/10 text-success-ink" : "bg-warning/10 text-warning-ink",
      )}
    >
      <span className={cn("size-1.5 rounded-full", done ? "bg-success" : "bg-warning")} aria-hidden />
      {label}
    </span>
  );
}
