import { CalendarDays, CalendarOff, ClipboardCheck, PencilLine, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ProgressRing, ProgressTile } from "@/components/dashboard/progress-tile";
import { SectionHeading } from "@/components/dashboard/section-heading";
import { StatTile, StatTiles } from "@/components/dashboard/stat-tile";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole } from "@/lib/auth/session";
import { LABELS } from "@/lib/constants/labels";
import { getTeacherDashboard, type TeacherStudentRow, type TodaySession } from "@/lib/data/teacher";
import { formatDateWithWeekday, formatPercent, today } from "@/lib/format";

const L = LABELS.teacher.home;
const S = L.students;

export const metadata: Metadata = { title: L.title };

export default async function TeacherHomePage() {
  const profile = await requireRole("teacher");
  const { sessions, students, studentCount, subjectCount, presenceRate } = await getTeacherDashboard();
  const dateLabel = formatDateWithWeekday(today());
  const firstName = profile.fullName.split(" ")[0] ?? profile.fullName;
  const doneCount = sessions.filter((session) => isDone(session)).length;

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
      {/* Colonne principale */}
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader
          showTitle
          title={L.greeting(firstName)}
          description={dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
        />

        <section aria-labelledby="statistiques" className="flex flex-col gap-3">
          <SectionHeading id="statistiques" title={LABELS.dashboard.statsTitle} href={ROUTES.teacher.schedule} />
          <StatTiles>
            <StatTile
              value={sessions.length}
              label={L.stats.sessionsToday}
              detail={L.stats.sessionsTodayDetail(doneCount)}
              links={[{ href: ROUTES.teacher.schedule, label: LABELS.dashboard.detail }]}
            />
            <StatTile value={studentCount} label={L.stats.followedStudents} detail={L.stats.followedStudentsDetail(subjectCount)} />
            <StatTile
              value={presenceRate === null ? LABELS.common.none : formatPercent(presenceRate)}
              label={L.stats.presenceRate}
              detail={L.stats.presenceRateDetail}
            />
          </StatTiles>
        </section>

        <StudentList students={students} />
      </div>

      {/* Colonne droite : mes séances du jour */}
      <aside className="flex flex-col gap-3" aria-labelledby="seances-titre">
        <SectionHeading id="seances-titre" title={L.mySessions} href={ROUTES.teacher.schedule} />
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
          <ul className="stagger grid gap-3 md:grid-cols-2 lg:grid-cols-1">
            {sessions.map((session, index) => (
              <li key={session.id}>
                <SessionTile session={session} index={index} />
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

function isDone(session: TodaySession): boolean {
  return session.studentCount > 0 && session.markedCount >= session.studentCount;
}

function SessionTile({ session, index }: { session: TodaySession; index: number }) {
  const done = isDone(session);
  const progress = session.studentCount > 0 ? session.markedCount / session.studentCount : 0;

  return (
    <ProgressTile
      index={index}
      ring={<ProgressRing value={progress} caption={done ? L.attendanceDone : L.attendanceTodo} />}
      title={`${session.subjectName} · ${session.levelName}`}
      description={`${L.sessionDetail(LABELS.teacher.schedule.time(session.startTime, session.endTime), session.room)} · ${L.studentsCount(session.studentCount)}`}
    >
      <Link
        href={ROUTES.teacher.call(session.id)}
        className="mt-2 inline-flex h-9 w-fit items-center gap-1.5 rounded-lg bg-white px-3 text-table font-medium text-heading shadow-card transition-transform duration-200 active:scale-[0.98]"
      >
        {done ? <PencilLine className="size-4" aria-hidden /> : <ClipboardCheck className="size-4" aria-hidden />}
        {done ? L.editAttendance : L.takeAttendance}
      </Link>
    </ProgressTile>
  );
}

function StudentList({ students }: { students: TeacherStudentRow[] }) {
  return (
    <section aria-labelledby="mes-eleves" className="flex min-w-0 flex-col gap-3">
      <SectionHeading id="mes-eleves" title={S.title} />
      {students.length === 0 ? (
        <EmptyState icon={Users} title={S.emptyTitle} description={S.emptyDescription} />
      ) : (
        <>
          {/* Mobile : cartes */}
          <ul className="flex flex-col gap-3 md:hidden" aria-label={S.caption}>
            {students.map((student) => (
              <li key={student.key} className="flex items-center gap-3 rounded-xl bg-card p-4 shadow-card">
                <StudentAvatar name={student.fullName} photoUrl={student.photoUrl} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium text-heading">{student.fullName}</span>
                  <span className="truncate text-caption text-muted-foreground">
                    {student.levelName} · {student.subjectName}
                  </span>
                  <LastStatus status={student.lastStatus} />
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop : tableau */}
          <div className="hidden max-h-[520px] overflow-auto rounded-xl bg-card shadow-card md:block">
            <table className="w-full border-collapse text-left text-table">
              <caption className="sr-only">{S.caption}</caption>
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="h-12 border-b border-divider">
                  <th scope="col" className="px-3 pl-4 font-medium text-heading lg:px-4 lg:pl-6">
                    {S.name}
                  </th>
                  <th scope="col" className="px-3 font-medium text-heading lg:px-4">
                    {S.level}
                  </th>
                  <th scope="col" className="px-3 font-medium text-heading lg:px-4">
                    {S.subject}
                  </th>
                  <th scope="col" className="px-3 pr-4 font-medium whitespace-nowrap text-heading lg:px-4">
                    {S.lastStatus}
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr
                    key={student.key}
                    className="h-[52px] border-b border-divider transition-colors duration-150 last:border-b-0 hover:bg-row-hover"
                  >
                    <td className="px-3 pl-4 lg:px-4 lg:pl-6">
                      <span className="flex items-center gap-3 font-medium text-heading">
                        <StudentAvatar name={student.fullName} photoUrl={student.photoUrl} className="size-7 border" />
                        <span className="truncate">{student.fullName}</span>
                      </span>
                    </td>
                    <td className="max-w-[150px] truncate px-3 lg:px-4 xl:max-w-none" title={student.levelName}>
                      {student.levelName}
                    </td>
                    <td className="px-3 lg:px-4">{student.subjectName}</td>
                    <td className="px-3 pr-4 lg:px-4">
                      <LastStatus status={student.lastStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function LastStatus({ status }: { status: TeacherStudentRow["lastStatus"] }) {
  if (!status) return <span className="text-caption text-subtle">{S.notMarked}</span>;
  return <StatusBadge status={status} />;
}
