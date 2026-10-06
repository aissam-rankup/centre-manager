import { CalendarCheck, CalendarDays, UserRound } from "lucide-react";
import Link from "@/components/shared/app-link";

import { ContactButtons } from "@/components/assistant/contact-buttons";
import { FollowUpDialog } from "@/components/assistant/follow-up-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLabels } from "@/lib/i18n/server";
import type { AbsenceRow } from "@/lib/data/absences";
import { formatDate, formatDateTime } from "@/lib/format";


type AbsencesViewProps = {
  rows: AbsenceRow[];
  dateIso: string;
  todayIso: string;
  /** Adresse de la page (formulaire de date). */
  basePath: string;
  /** Préfixe des fiches élèves. */
  fileBase: string;
};

/** Élèves absents à une date : profil, matière, série en cours, contact et relance. */
export async function AbsencesView({ rows, dateIso, todayIso, basePath, fileBase }: AbsencesViewProps) {
  const LABELS = await getLabels();
  const L = LABELS.absencesPage;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={L.title}
        description={L.description(formatDate(dateIso))}
        actions={
          <form action={basePath} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-caption text-muted-foreground">{L.date}</span>
              <Input type="date" name="date" defaultValue={dateIso} max={todayIso} className="numeric w-44 font-normal" />
            </label>
            <Button type="submit" variant="outline">
              <CalendarDays aria-hidden />
              {LABELS.common.show}
            </Button>
            {dateIso !== todayIso ? (
              <Button asChild variant="ghost">
                <Link href={basePath}>{L.today}</Link>
              </Button>
            ) : null}
          </form>
        }
      />

      <p className="text-section">{L.count(rows.length)}</p>

      {rows.length === 0 ? (
        <EmptyState icon={CalendarCheck} title={L.emptyTitle} description={L.emptyDescription} />
      ) : (
        <ul className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-4 rounded-xl bg-card p-5 shadow-card">
              <div className="flex items-start gap-3">
                <StudentAvatar name={row.fullName} photoUrl={row.photoUrl} status="overdue" className="size-14" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <Link href={`${fileBase}/${row.studentId}`} className="truncate rounded-sm font-semibold text-heading hover:text-primary">
                    {row.fullName}
                  </Link>
                  <span className="truncate text-caption text-muted-foreground">{row.levelName}</span>
                  <StatusBadge status="absent" />
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-divider pt-3 text-caption">
                <div className="flex min-w-0 flex-col">
                  <dt className="text-muted-foreground">{L.subject}</dt>
                  <dd className="truncate font-medium text-heading">{row.subjectName}</dd>
                </div>
                <div className="flex min-w-0 flex-col">
                  <dt className="text-muted-foreground">{L.teacher}</dt>
                  <dd className="truncate font-medium text-heading">{row.teacherName ?? LABELS.common.none}</dd>
                </div>
              </dl>

              {row.markedByName && row.markedByRole ? (
                <p className="text-caption text-subtle">
                  {LABELS.attendanceSheet.markedBy(LABELS.attendanceMarkers[row.markedByRole], row.markedByName, formatDateTime(row.markedAt))}
                </p>
              ) : null}

              {row.streak ? (
                <p className="rounded-lg bg-warning/10 px-3 py-2 text-caption font-medium text-warning-ink">{L.streak(row.streak)}</p>
              ) : null}

              <div className="mt-auto flex flex-wrap items-center gap-2">
                <ContactButtons phone={row.guardianPhone} name={row.guardianName ?? row.fullName} />
                <FollowUpDialog
                  studentId={row.studentId}
                  studentName={row.fullName}
                  invoiceId={null}
                  defaultType="absence"
                  triggerVariant="compact"
                />
                <Button asChild variant="ghost" className="ml-auto">
                  <Link href={`${fileBase}/${row.studentId}`}>
                    <UserRound aria-hidden />
                    {L.openFile}
                  </Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
