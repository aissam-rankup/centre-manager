import { CalendarClock, CircleCheck, Mail, MailCheck, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/components/shared/app-link";

import { SectionHeading } from "@/components/dashboard/section-heading";
import { StatTile, StatTiles } from "@/components/dashboard/stat-tile";
import { CenterStatusBadge } from "@/components/platform/center-status-badge";
import { DaysRemaining } from "@/components/platform/days-remaining";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/auth/routes";
import { LABELS } from "@/lib/constants/labels";
import { type CenterStatus, getPlatformDashboard } from "@/lib/data/platform";
import { formatDate, formatMAD } from "@/lib/format";
import { formatPhone, toTelHref } from "@/lib/phone";

const L = LABELS.platform.dashboard;
const STATUSES: readonly CenterStatus[] = ["trial", "active", "past_due", "suspended", "cancelled"];
const REMINDER_KINDS: Record<string, string> = L.reminderKinds;

export const metadata: Metadata = { title: L.title };

export default async function PlatformDashboardPage() {
  const { overview, overdue, upcoming, notifications } = await getPlatformDashboard();
  const statusCounts: Record<CenterStatus, number> = {
    trial: overview.trial_count,
    active: overview.active_count,
    past_due: overview.past_due_count,
    suspended: overview.suspended_count,
    cancelled: overview.cancelled_count,
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={L.title} description={L.description} />

      <StatTiles>
        <StatTile value={formatMAD(overview.monthly_recurring_revenue)} label={L.mrr} detail={L.mrrDetail} />
        <StatTile value={formatMAD(overview.collected_this_month)} label={L.collected} href={ROUTES.platform.billing} />
        <StatTile
          value={overview.students_count}
          label={L.students}
          detail={`${overview.users_count} ${L.users.toLowerCase()}`}
        />
      </StatTiles>

      <section aria-labelledby="statuts" className="flex flex-col gap-4">
        <SectionHeading id="statuts" title={L.centersByStatus} />
        <ul className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {STATUSES.map((status) => (
            <li key={status}>
              <Link
                href={`${ROUTES.platform.centers}?statut=${status}`}
                className="card-interactive flex flex-col gap-1 rounded-xl bg-card px-5 py-4 shadow-card"
              >
                <span className="numeric text-stat text-heading">{statusCounts[status]}</span>
                <CenterStatusBadge status={status} />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="retards" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <SectionHeading id="retards" title={L.overdueTitle} />
          <p className="text-caption text-muted-foreground">{L.overdueDescription}</p>
        </div>
        {overdue.length === 0 ? (
          <EmptyState icon={CircleCheck} title={L.overdueEmpty} description={L.overdueEmptyDescription} />
        ) : (
          <ul className="stagger flex flex-col gap-3">
            {overdue.map((center) => {
              const tel = center.owner_contact_phone ? toTelHref(center.owner_contact_phone) : null;
              return (
                <li
                  key={center.center_id}
                  className="flex flex-col gap-4 rounded-xl bg-card p-5 shadow-card lg:flex-row lg:items-center lg:gap-6"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Link
                      href={`${ROUTES.platform.centers}/${center.center_id}`}
                      className="truncate rounded-sm font-semibold text-heading hover:text-primary"
                    >
                      {center.name}
                    </Link>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <CenterStatusBadge status={center.status} />
                      <span className="text-caption font-medium text-danger-ink">{L.daysLate(center.days_overdue)}</span>
                      <span className="text-caption text-muted-foreground">{L.dueSince(formatDate(center.current_period_end))}</span>
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-caption lg:w-[420px]">
                    <div className="flex flex-col">
                      <dt className="text-muted-foreground">{L.amountDue}</dt>
                      <dd className="font-semibold text-heading">
                        <Money amount={center.amount_due} /> {LABELS.platform.intervalShort[center.billing_interval]}
                      </dd>
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <dt className="text-muted-foreground">{L.director}</dt>
                      <dd className="truncate font-medium text-heading">
                        {center.owner_contact_name ?? LABELS.platform.notSet}
                      </dd>
                      {center.owner_contact_phone ? (
                        <dd className="numeric text-muted-foreground">{formatPhone(center.owner_contact_phone)}</dd>
                      ) : null}
                    </div>
                  </dl>

                  <div className="flex flex-wrap gap-2">
                    {tel ? (
                      <Button asChild variant="outline">
                        <a href={tel} aria-label={L.callLabel(center.name)}>
                          <Phone aria-hidden />
                          {L.call}
                        </a>
                      </Button>
                    ) : null}
                    {center.owner_contact_email ? (
                      <Button asChild variant="outline">
                        <a href={`mailto:${center.owner_contact_email}`} aria-label={L.emailLabel(center.name)}>
                          <Mail aria-hidden />
                          {L.email}
                        </a>
                      </Button>
                    ) : null}
                    <Button asChild variant="ghost">
                      <Link href={`${ROUTES.platform.centers}/${center.center_id}`}>{L.openCenter}</Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <div className="grid gap-6 xl:grid-cols-2">
        <section aria-labelledby="echeances" className="flex flex-col gap-4">
          <SectionHeading id="echeances" title={L.upcomingTitle} />
          {upcoming.length === 0 ? (
            <EmptyState icon={CalendarClock} title={L.upcomingEmpty} />
          ) : (
            <ul className="flex flex-col divide-y divide-divider rounded-xl bg-card shadow-card">
              {upcoming.map((center) => (
                <li key={center.center_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                  <Link
                    href={`${ROUTES.platform.centers}/${center.center_id}`}
                    className="min-w-0 flex-1 truncate rounded-sm font-medium text-heading hover:text-primary"
                  >
                    {center.name}
                  </Link>
                  <span className="text-caption text-muted-foreground">{L.dueOn(formatDate(center.current_period_end))}</span>
                  <DaysRemaining days={center.days_remaining} className="text-caption" />
                  <span className="text-caption">
                    <Money amount={center.price} /> {LABELS.platform.intervalShort[center.billing_interval]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="rappels" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <SectionHeading id="rappels" title={L.remindersTitle} />
            <p className="text-caption text-muted-foreground">{L.remindersDescription}</p>
          </div>
          {notifications.length === 0 ? (
            <EmptyState icon={MailCheck} title={L.remindersEmpty} />
          ) : (
            <ul className="flex max-h-[360px] flex-col divide-y divide-divider overflow-y-auto rounded-xl bg-card shadow-card">
              {notifications.map((item) => (
                <li key={item.notification_id} className="flex flex-col gap-0.5 px-5 py-3">
                  <span className="flex items-center justify-between gap-3">
                    <span className="truncate font-medium text-heading">{item.center_name ?? "—"}</span>
                    <span className={item.sent_at ? "text-caption text-success-ink" : "text-caption text-warning-ink"}>
                      {item.sent_at ? L.reminderSent : L.reminderPending}
                    </span>
                  </span>
                  <span className="text-caption text-muted-foreground">
                    {REMINDER_KINDS[item.kind] ?? item.kind} · {formatDate(item.scheduled_for)} ·{" "}
                    {item.recipient ?? L.noRecipient}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
