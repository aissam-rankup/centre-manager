import { CalendarSync, ListChecks, Settings, TriangleAlert, Users, Wallet } from "lucide-react";
import Link from "@/components/shared/app-link";

import { FilterChips } from "@/components/admin/filter-chips";
import { CampaignStudents } from "@/components/reenrollment/campaign-students";
import { ReminderWaves } from "@/components/reminders/reminder-waves";
import { CancelCampaignButton, ConfirmCampaignButton } from "@/components/reenrollment/campaign-actions";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { Money } from "@/components/shared/money";
import { Button } from "@/components/ui/button";
import type { CampaignPage } from "@/lib/data/reenrollment";
import { formatDateTime, formatMAD, formatMonth, formatPercent } from "@/lib/format";
import { getLabels } from "@/lib/i18n/server";
import { countIntents, isoDate } from "@/lib/reenrollment";
import { cn } from "@/lib/utils";

type CampaignViewProps = {
  page: CampaignPage;
  todayIso: string;
  /** Adresse de l'écran (choix de la campagne). */
  basePath: string;
  /** Préfixe des fiches élèves. */
  fileBase: string;
  /** Réglages du centre (admin), pour activer la réinscription. */
  settingsHref: string | null;
};

/** Revue d'une campagne : état, chiffres clés, élèves à risque, intention de chaque élève, confirmation. */
export async function CampaignView({ page, todayIso, basePath, fileBase, settingsHref }: CampaignViewProps) {
  const LABELS = await getLabels();
  const R = LABELS.reenrollment.review;
  const { run, runs, students } = page;

  if (!run) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={LABELS.nav.reenrollment} description={R.description} />
        <EmptyState
          icon={CalendarSync}
          title={R.emptyTitle}
          description={R.emptyDescription}
          action={
            settingsHref ? (
              <Button asChild variant="outline">
                <Link href={settingsHref}>
                  <Settings aria-hidden />
                  {R.openSettings}
                </Link>
              </Button>
            ) : null
          }
        />
      </div>
    );
  }

  const monthName = formatMonth(isoDate(run.year, run.month, 1));
  const counts = countIntents(students);
  const atRisk = students.filter((student) => student.atRisk);
  const draft = run.status === "draft";
  const cancelled = run.status === "cancelled";
  const started = isoDate(run.year, run.month, 1) <= todayIso;
  const keptLines = students.reduce(
    (sum, student) => sum + (student.intent === "dropped" || student.intent === "paused" ? 0 : student.lines.filter((line) => line.kept).length),
    0,
  );

  const notice = run.status === "cancelled"
    ? { tone: "muted", text: R.notice.cancelled(run.cancelReason) }
    : draft
      ? { tone: started ? "warning" : "primary", text: started ? R.notice.late : page.canConfirm ? R.notice.draft : R.notice.draftAssistant }
      : { tone: "success", text: R.notice.confirmed(run.confirmedAt ? formatDateTime(run.confirmedAt) : "", run.confirmedByName) };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={LABELS.nav.reenrollment}
        description={R.description}
        actions={
          draft && page.canConfirm ? (
            <>
              <CancelCampaignButton runId={run.id} monthName={monthName} />
              <ConfirmCampaignButton
                runId={run.id}
                monthName={monthName}
                students={run.studentCount}
                invoices={keptLines}
                total={formatMAD(run.totalExpected)}
                pending={counts.pending}
                dropped={counts.dropped}
                paused={counts.paused}
                riskPending={atRisk.filter((student) => student.intent === "pending").length}
              />
            </>
          ) : null
        }
      />

      {runs.length > 1 ? (
        <FilterChips
          label={R.campaigns}
          options={runs.map((item) => ({
            value: item.id,
            label: `${R.month(formatMonth(isoDate(item.year, item.month, 1)))} · ${R.status[item.status]}`,
          }))}
          current={run.id}
          href={(value) => (value ? `${basePath}?campagne=${value}` : basePath)}
        />
      ) : null}

      <div className="flex flex-col gap-1">
        <h2 className="text-section">
          {R.month(monthName)} · {R.status[run.status]}
        </h2>
        <p
          className={cn(
            "rounded-xl px-4 py-3",
            notice.tone === "warning" && "bg-warning/10",
            notice.tone === "primary" && "bg-primary-soft",
            notice.tone === "success" && "bg-success/10",
            notice.tone === "muted" && "bg-muted",
          )}
        >
          {notice.text}
          {page.canEdit || !draft || page.canConfirm ? null : ` ${R.notice.support}`}
        </p>
      </div>

      {cancelled ? null : (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard label={R.stats.students} value={run.studentCount} icon={Users} className="col-span-2 xl:col-span-1" />
          <StatCard
            label={R.stats.expected}
            value={<Money amount={run.totalExpected} />}
            icon={Wallet}
            tone="brand"
            className="col-span-2 xl:col-span-1"
          />
          <StatCard
            label={R.stats.pending}
            value={counts.pending}
            hint={R.stats.decisionsValue(counts.confirmed, counts.dropped, counts.paused)}
            icon={ListChecks}
            tone="success"
          />
          <StatCard label={R.stats.risk} value={atRisk.length} icon={TriangleAlert} tone={atRisk.length > 0 ? "warning" : "success"} />
        </div>
      )}

      {page.reminders ? (
        <SectionCard title={LABELS.reenrollment.reminders.title} description={LABELS.reenrollment.reminders.description}>
          <ReminderWaves key={run.id} items={page.reminders.items} daysBefore={page.reminders.daysBefore} fileBase={fileBase} />
        </SectionCard>
      ) : null}

      {cancelled ? null : (
        <SectionCard title={R.risk.title} description={R.risk.description(page.riskThreshold)}>
          {atRisk.length === 0 ? (
            <p className="text-muted-foreground">{R.risk.none}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-divider">
              {atRisk.map((student) => (
                <li key={student.studentId} className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                  <a
                    href={`#eleve-${student.studentId}`}
                    className="flex min-h-11 flex-1 items-center rounded-sm font-medium text-heading hover:text-primary"
                  >
                    {student.fullName}
                  </a>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
                    {student.overdueAmount > 0 ? (
                      <span className="font-medium text-danger-ink">{R.risk.overdue(formatMAD(student.overdueAmount))}</span>
                    ) : null}
                    {student.lowAttendance && student.attendanceRate !== null ? (
                      <span className="font-medium text-warning-ink">{R.risk.attendance(formatPercent(student.attendanceRate))}</span>
                    ) : null}
                    <span className="text-muted-foreground">{R.intent[student.intent]}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      <CampaignStudents
        key={run.id}
        runId={run.id}
        students={students}
        editable={page.canEdit}
        issued={!draft && !cancelled}
        cancelled={cancelled}
        fileBase={fileBase}
      />
    </div>
  );
}
