import { AlertTriangle, BellRing, CalendarX, CircleCheckBig, UserCheck, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ContactButtons } from "@/components/assistant/contact-buttons";
import { FollowUpDialog } from "@/components/assistant/follow-up-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { ROUTES } from "@/lib/auth/routes";
import { LABELS } from "@/lib/constants/labels";
import { type AbsenceAlertItem, type FollowUpQueueItem, getAssistantDashboard } from "@/lib/data/assistant";
import { formatDate, formatDateWithWeekday, formatMAD, today } from "@/lib/format";

const L = LABELS.assistant.dashboard;

export const metadata: Metadata = { title: L.title };

export default async function AssistantDashboardPage() {
  const { stats, queue, alerts } = await getAssistantDashboard();
  const dateLabel = formatDateWithWeekday(today());

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={L.title} description={dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)} />

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <StatCard
          label={L.stats.unpaid}
          value={stats.unpaidCount}
          icon={Wallet}
          tone="brand"
          hint={L.stats.unpaidHint(formatMAD(stats.unpaidAmount))}
        />
        <StatCard
          label={L.stats.overdue}
          value={stats.overdueCount}
          icon={AlertTriangle}
          tone="danger"
          hint={L.stats.overdueHint(LABELS.billing.studentsCount(stats.overdueStudents), formatMAD(stats.overdueAmount))}
        />
        <StatCard
          label={L.stats.absencesToday}
          value={stats.absencesToday}
          icon={CalendarX}
          tone="warning"
          hint={L.stats.absencesTodayHint}
        />
        <StatCard
          label={L.stats.absenceAlerts}
          value={stats.openAbsenceAlerts}
          icon={BellRing}
          tone="warning"
          hint={L.stats.absenceAlertsHint}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <SectionCard
          id="relances"
          title={L.queue.title}
          description={L.queue.description}
          className="xl:col-span-3"
          aside={<CountBadge count={queue.length} />}
        >
          {queue.length === 0 ? (
            <EmptyState icon={CircleCheckBig} title={L.queue.emptyTitle} description={L.queue.emptyDescription} />
          ) : (
            <ul className="flex flex-col divide-y">
              {queue.map((item) => (
                <QueueRow key={item.studentId} item={item} />
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          id="alertes"
          title={L.alerts.title}
          description={L.alerts.description}
          className="xl:col-span-2"
          aside={<CountBadge count={alerts.length} />}
        >
          {alerts.length === 0 ? (
            <EmptyState icon={UserCheck} title={L.alerts.emptyTitle} description={L.alerts.emptyDescription} />
          ) : (
            <ul className="flex flex-col divide-y">
              {alerts.map((alert) => (
                <AlertRow key={alert.id} alert={alert} />
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function CountBadge({ count }: { count: number }) {
  return (
    <span className="numeric inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-muted px-2 text-caption">
      {count}
    </span>
  );
}

function QueueRow({ item }: { item: FollowUpQueueItem }) {
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
      <Link
        href={`${ROUTES.assistant.students}/${item.studentId}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-[10px]"
      >
        <StudentAvatar name={item.fullName} photoUrl={item.photoUrl} status="overdue" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{item.fullName}</span>
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

function AlertRow({ alert }: { alert: AbsenceAlertItem }) {
  return (
    <li className="flex items-center gap-3 py-4 first:pt-0 last:pb-0">
      <Link
        href={`${ROUTES.assistant.students}/${alert.studentId}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-[10px]"
      >
        <StudentAvatar name={alert.fullName} photoUrl={alert.photoUrl} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{alert.fullName}</span>
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
    </li>
  );
}
