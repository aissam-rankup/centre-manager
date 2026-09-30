import { BellRing, CalendarCheck, CalendarX, FileDown, MessageSquareText } from "lucide-react";

import { FilterChips, type FilterOption } from "@/components/admin/filter-chips";
import { AttendanceNote } from "@/components/attendance/attendance-note";
import { StatTile, StatTiles } from "@/components/dashboard/stat-tile";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import {
  ATTENDANCE_PERIODS,
  type AttendanceFilters,
  attendanceQuery,
  periodStart,
  summarizeAttendance,
} from "@/lib/attendance";
import type { AttendanceData } from "@/lib/data/attendance";
import { formatDate, formatDateTime, formatDateWithWeekday, formatPercent } from "@/lib/format";
import { getLabels } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

type AttendanceSheetProps = {
  data: AttendanceData;
  filters: AttendanceFilters;
  /** Page courante (liens des filtres). */
  basePath: string;
  /** Paramètres à conserver dans les liens (ex. onglet de la fiche). */
  keep?: Record<string, string>;
  /** Professeur : message « vos matières uniquement ». */
  teacherScope?: boolean;
};

/** Fiche d'assiduité : taux, absences par matière, séries, séances manquées, relances, export PDF. */
export async function AttendanceSheet({ data, filters, basePath, keep = {}, teacherScope = false }: AttendanceSheetProps) {
  const LABELS = await getLabels();
  const L = LABELS.attendanceSheet;
  const summary = summarizeAttendance(data.records, { from: periodStart(filters.period), subjectId: filters.subjectId });
  const subjects = [...new Map(data.records.map((r) => [r.subjectId, r.subjectName])).entries()].sort((a, b) => a[1].localeCompare(b[1], "fr"));
  const href = (patch: Partial<AttendanceFilters>) => `${basePath}?${attendanceQuery({ ...filters, ...patch }, keep)}`;
  const pdfHref = `/fiches/assiduite/${data.student?.id ?? ""}?${attendanceQuery(filters)}`;

  const periodOptions: FilterOption[] = ATTENDANCE_PERIODS.map((period) => ({ value: period, label: L.periods[period] }));
  const subjectOptions: FilterOption[] = [{ value: null, label: L.allSubjects }, ...subjects.map(([id, name]) => ({ value: id, label: name }))];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-3">
          <FilterChips
            label={`${L.filtersLabel} — ${L.period}`}
            options={periodOptions}
            current={filters.period}
            href={(value) => href({ period: ATTENDANCE_PERIODS.find((p) => p === value) ?? "all" })}
          />
          {subjects.length > 1 ? (
            <FilterChips
              label={`${L.filtersLabel} — ${L.subject}`}
              options={subjectOptions}
              current={filters.subjectId}
              href={(value) => href({ subjectId: value })}
            />
          ) : null}
        </div>
        {data.student ? (
          <Button asChild variant="outline" className="w-fit shrink-0">
            <a href={pdfHref} download>
              <FileDown aria-hidden />
              {L.exportPdf}
            </a>
          </Button>
        ) : null}
      </div>

      {teacherScope ? <p className="text-caption text-muted-foreground">{L.teacherScope}</p> : null}

      {summary.sessions === 0 ? (
        <EmptyState icon={CalendarCheck} title={L.noSessionsTitle} description={L.noSessionsDescription} />
      ) : (
        <>
          <StatTiles>
            <StatTile value={summary.absences} label={L.totalAbsences} detail={L.periods[filters.period]} />
            <StatTile value={summary.rate === null ? L.noRate : formatPercent(summary.rate)} label={L.rate} />
            <StatTile value={summary.sessions} label={L.sessions} />
          </StatTiles>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title={L.bySubject}>
              <ul className="flex flex-col gap-4">
                {summary.bySubject.map((subject) => (
                  <li key={subject.subjectId} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-medium text-heading">{subject.subjectName}</span>
                      <span className="numeric shrink-0 text-caption text-muted-foreground">
                        {L.absencesCount(subject.absences)} · {subject.rate === null ? L.noRate : formatPercent(subject.rate)}
                      </span>
                    </div>
                    <div
                      className="h-2 overflow-hidden rounded-full bg-muted"
                      role="img"
                      aria-label={`${subject.subjectName} : ${L.rate} ${subject.rate === null ? L.noRate : formatPercent(subject.rate)}`}
                    >
                      <div
                        className={cn("h-full rounded-full", (subject.rate ?? 1) < 0.8 ? "bg-warning" : "bg-success")}
                        style={{ width: `${Math.round((subject.rate ?? 0) * 100)}%` }}
                      />
                    </div>
                    <span className="text-caption text-subtle">{L.sessionsCount(subject.sessions)}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard title={L.streaksTitle} description={L.alertHint}>
              {summary.streaks.length === 0 ? (
                <p className="text-muted-foreground">{L.streaksEmpty}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {summary.streaks.map((streak) => (
                    <li
                      key={`${streak.subjectName}-${streak.from}`}
                      className={cn(
                        "flex flex-col gap-1 rounded-lg border px-3 py-2",
                        streak.alert ? "border-danger/40 bg-danger/5" : "border-warning/40 bg-warning/5",
                      )}
                    >
                      <span className="flex flex-wrap items-center gap-2 font-medium text-heading">
                        {L.streak(streak.length, streak.subjectName)}
                        {streak.alert ? (
                          <span className="inline-flex items-center gap-1 text-caption font-semibold text-danger-ink">
                            <BellRing className="size-3.5" aria-hidden />
                            {L.alertTriggered}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-caption text-muted-foreground">
                        {L.streakRange(formatDate(streak.from), formatDate(streak.to))}
                        {streak.ongoing ? ` · ${L.streakOngoing}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          <SectionCard title={L.listTitle} aside={<span className="text-caption text-muted-foreground">{L.absencesCount(summary.absences)}</span>}>
            {summary.absencesList.length === 0 ? (
              <EmptyState icon={CalendarCheck} title={L.emptyTitle} description={L.emptyDescription} />
            ) : (
              <ol aria-label={L.listCaption} className="flex flex-col divide-y divide-divider">
                {summary.absencesList.map((absence) => {
                  const dateLabel = formatDate(absence.date);
                  return (
                    <li key={absence.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4">
                      <span
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-lg",
                          absence.triggersAlert ? "bg-danger/15 text-danger-ink" : "bg-warning/15 text-warning-ink",
                        )}
                      >
                        {absence.triggersAlert ? <BellRing className="size-5" aria-hidden /> : <CalendarX className="size-5" aria-hidden />}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="font-medium text-heading first-letter:uppercase">{formatDateWithWeekday(absence.date)}</span>
                        <span className="text-caption text-muted-foreground">
                          {absence.startTime && absence.endTime ? `${absence.startTime} – ${absence.endTime}` : L.noTime} · {absence.subjectName}
                          {absence.teacherName ? ` · ${absence.teacherName}` : ""}
                        </span>
                        {absence.streakLength >= 2 ? (
                          <span className={cn("text-caption font-medium", absence.triggersAlert ? "text-danger-ink" : "text-warning-ink")}>
                            {L.position(absence.streakPosition, absence.streakLength)}
                            {absence.triggersAlert ? ` · ${L.alertTriggered}` : ""}
                          </span>
                        ) : null}
                        <span className={cn("text-caption", absence.note ? "text-foreground" : "text-subtle")}>{absence.note ?? L.noNote}</span>
                      </div>
                      <AttendanceNote attendanceId={absence.id} note={absence.note} dateLabel={dateLabel} />
                    </li>
                  );
                })}
              </ol>
            )}
          </SectionCard>
        </>
      )}

      {!teacherScope ? (
        <SectionCard title={L.followUpsTitle}>
          {data.followUps.length === 0 ? (
            <p className="text-muted-foreground">{L.followUpsEmpty}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-divider">
              {data.followUps.map((followUp) => (
                <li key={followUp.id} className="flex items-start gap-3 py-3">
                  <MessageSquareText className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium text-heading">
                      {formatDateTime(followUp.createdAt)} · {LABELS.followUp.channels[followUp.channel]}
                    </span>
                    {followUp.note ? <span className="text-caption">{followUp.note}</span> : null}
                    {followUp.authorName ? <span className="text-caption text-subtle">{L.followUpBy(followUp.authorName)}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      ) : null}
    </div>
  );
}
