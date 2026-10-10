import { CircleCheckBig, UserCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/components/shared/app-link";

import { AbsenceAlertsBlock } from "@/components/absences/absence-alerts";
import { ContactButtons } from "@/components/assistant/contact-buttons";
import { FollowUpDialog } from "@/components/assistant/follow-up-dialog";
import { ProgressRing, ProgressTile } from "@/components/dashboard/progress-tile";
import { ReminderCard } from "@/components/dashboard/reminder-card";
import { SectionHeading } from "@/components/dashboard/section-heading";
import { StatTile, StatTiles } from "@/components/dashboard/stat-tile";
import { StudentBoard } from "@/components/dashboard/student-board";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole } from "@/lib/auth/session";
import { getAppLocale } from "@/lib/i18n/request-locale";
import { getLabels } from "@/lib/i18n/server";
import { getAbsenceAlertsSettings, getAbsencesToNotify } from "@/lib/data/absence-alerts";
import { type AbsenceAlertItem, type FollowUpQueueItem, getAssistantDashboard } from "@/lib/data/assistant";
import { formatDate, formatDateWithWeekday, formatMAD, today } from "@/lib/format";


export async function generateMetadata(): Promise<Metadata> {
  const LABELS = await getLabels();
  const L = LABELS.assistant.dashboard;
  return { title: L.title };
}

export default async function AssistantDashboardPage() {
  const LABELS = await getLabels();
  const L = LABELS.assistant.dashboard;
  const D = LABELS.dashboard;
  const [profile, { stats, monthUnpaid, queue, alerts, students, presence }, absenceSettings] = await Promise.all([
    requireRole("assistant"),
    getAssistantDashboard(),
    getAbsenceAlertsSettings(),
  ]);
  // Absences à signaler et séries d'absences : module Suivi des absences.
  const tracking = profile.modules.includes("absence_tracking");
  const absences = tracking && absenceSettings.enabled ? await getAbsencesToNotify() : [];
  const absencesPending = absences.filter((item) => !item.notifiedAt).length;
  const dateLabel = formatDateWithWeekday(today(), await getAppLocale());

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
      {/* Colonne principale */}
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader title={L.title} description={dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)} />

        <section aria-labelledby="statistiques" className="flex flex-col gap-3">
          <SectionHeading id="statistiques" title={D.statsTitle} href={ROUTES.assistant.students} />
          <StatTiles>
            <StatTile
              value={stats.overdueCount}
              label={L.stats.overduePayments}
              detail={L.stats.overduePaymentsDetail(LABELS.billing.studentsCount(stats.overdueStudents), formatMAD(stats.overdueAmount))}
              links={[{ href: "#relances", label: D.detail }]}
            />
            <StatTile
              value={formatMAD(monthUnpaid.amount)}
              label={L.stats.monthUnpaid}
              detail={L.stats.monthUnpaidDetail(monthUnpaid.count)}
              links={[{ href: ROUTES.assistant.students, label: D.detail }]}
            />
            <StatTile
              value={stats.absencesToday}
              label={L.stats.absencesToday}
              detail={L.stats.absencesTodayDetail(stats.openAbsenceAlerts)}
              href={ROUTES.assistant.absences}
              links={[{ href: ROUTES.assistant.absences, label: D.detail }]}
            />
          </StatTiles>
        </section>

        {tracking && absenceSettings.enabled ? (
          <section aria-labelledby="absences-a-signaler" id="absences-signaler" className="flex scroll-mt-4 flex-col gap-3">
            <SectionHeading
              id="absences-a-signaler"
              title={LABELS.absenceAlerts.title}
              actions={<CountBadge count={absencesPending} />}
            />
            <div className="rounded-xl bg-card p-5 shadow-card md:p-6">
              <AbsenceAlertsBlock items={absences} fileBase={ROUTES.assistant.students} />
            </div>
          </section>
        ) : null}

        <section aria-labelledby="relances-titre" id="relances" className="flex scroll-mt-4 flex-col gap-3">
          <SectionHeading id="relances-titre" title={L.queue.title} actions={<CountBadge count={queue.length} />} />
          <div className="rounded-xl bg-card p-5 shadow-card md:p-6">
            <p className="mb-4 text-caption text-muted-foreground">{L.queue.description}</p>
            {queue.length === 0 ? (
              <EmptyState icon={CircleCheckBig} title={L.queue.emptyTitle} description={L.queue.emptyDescription} />
            ) : (
              <ul className="flex flex-col divide-y divide-divider">
                {queue.map((item) => (
                  <QueueRow key={item.studentId} item={item} />
                ))}
              </ul>
            )}
          </div>
        </section>

        {tracking ? (
          <section aria-labelledby="alertes-titre" id="alertes" className="flex scroll-mt-4 flex-col gap-3">
            <SectionHeading id="alertes-titre" title={L.alerts.title} actions={<CountBadge count={alerts.length} />} />
            <div className="rounded-xl bg-card p-5 shadow-card md:p-6">
              <p className="mb-4 text-caption text-muted-foreground">{L.alerts.description}</p>
              {alerts.length === 0 ? (
                <EmptyState icon={UserCheck} title={L.alerts.emptyTitle} description={L.alerts.emptyDescription} />
              ) : (
                <ul className="flex flex-col divide-y divide-divider">
                  {alerts.map((alert) => (
                    <AlertRow key={alert.id} alert={alert} />
                  ))}
                </ul>
              )}
            </div>
          </section>
        ) : null}

        <StudentBoard students={students} fileBase={ROUTES.assistant.students} seeAllHref={ROUTES.assistant.students} />
      </div>

      {/* Colonne droite */}
      <aside className="flex flex-col gap-6" aria-label={D.reminder.title}>
        <section aria-labelledby="rappel" className="flex flex-col gap-3">
          <SectionHeading id="rappel" title={D.reminder.title} href="#relances" />
          <ReminderCard
            title={D.reminder.cardTitle}
            description={D.reminder.cardDescription(queue.length)}
            href="#relances"
            linkLabel={D.reminder.link}
          />
        </section>

        <section aria-labelledby="presences" className="flex flex-col gap-3">
          <SectionHeading id="presences" title={D.presence.title} />
          {presence.length === 0 ? (
            <EmptyState icon={UserCheck} title={D.presence.emptyTitle} description={D.presence.emptyDescription} />
          ) : (
            <div className="stagger grid gap-3 md:grid-cols-2 lg:grid-cols-1">
              {presence.map((subject, index) => (
                <ProgressTile
                  key={subject.subjectId}
                  index={index}
                  ring={<ProgressRing value={subject.rate} caption={D.presence.ring} />}
                  title={subject.subjectName}
                  description={D.presence.detail(subject.levelName, subject.students)}
                />
              ))}
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}

function CountBadge({ count }: { count: number }) {
  return (
    <span className="numeric inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-primary-soft px-2 text-caption text-primary">
      {count}
    </span>
  );
}

async function QueueRow({ item }: { item: FollowUpQueueItem }) {
  const LABELS = await getLabels();
  const L = LABELS.assistant.dashboard;
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
      <Link
        href={`${ROUTES.assistant.students}/${item.studentId}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg"
      >
        <StudentAvatar name={item.fullName} photoUrl={item.photoUrl} status="overdue" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-heading">{item.fullName}</span>
          <span className="truncate text-caption text-muted-foreground">
            {item.levelName} ·{" "}
            {item.lastFollowUpAt ? L.queue.lastFollowUp(formatDate(item.lastFollowUpAt)) : L.queue.neverFollowedUp}
          </span>
        </span>
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
        <div className="flex flex-col items-start sm:items-end">
          <Money amount={item.overdueAmount} />
          <span className="text-caption font-medium text-danger-ink">{LABELS.billing.daysOverdue(item.daysOverdue)}</span>
        </div>
        <div className="flex items-center gap-1">
          <ContactButtons phone={item.guardianPhone} name={item.guardianName ?? item.fullName} />
          <FollowUpDialog
            studentId={item.studentId}
            studentName={item.fullName}
            invoiceId={item.oldestInvoiceId}
            defaultType="payment"
            triggerVariant="compact"
          />
        </div>
      </div>
    </li>
  );
}

async function AlertRow({ alert }: { alert: AbsenceAlertItem }) {
  const LABELS = await getLabels();
  const L = LABELS.assistant.dashboard;
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
      <Link
        href={`${ROUTES.assistant.students}/${alert.studentId}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg"
      >
        <StudentAvatar name={alert.fullName} photoUrl={alert.photoUrl} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-heading">{alert.fullName}</span>
          <span className="text-caption font-medium text-warning-ink">
            {L.alerts.absences(alert.absenceCount, alert.subjectName)}
          </span>
          {alert.lastSessionDate ? (
            <span className="text-caption text-muted-foreground">
              {L.alerts.lastSession(formatDate(alert.lastSessionDate))}
            </span>
          ) : null}
        </span>
      </Link>
      <div className="flex items-center gap-1">
        <ContactButtons phone={alert.guardianPhone} name={alert.guardianName ?? alert.fullName} />
        <FollowUpDialog
          studentId={alert.studentId}
          studentName={alert.fullName}
          invoiceId={null}
          defaultType="absence"
          triggerVariant="compact"
        />
      </div>
    </li>
  );
}
