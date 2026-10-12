import { CalendarClock, CircleCheck, Mail, MailCheck, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/components/shared/app-link";

import { SectionHeading } from "@/components/dashboard/section-heading";
import { CenterStatusBadge } from "@/components/platform/center-status-badge";
import { DaysRemaining } from "@/components/platform/days-remaining";
import { PeriodSelector } from "@/components/platform/period-selector";
import { RevenueChart, type RevenueMonth } from "@/components/platform/revenue-chart";
import { RevenueKpis, RevenueTrend } from "@/components/platform/revenue-kpis";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/auth/routes";
import { type CenterStatus, getPlatformDashboard, getPlatformRevenue } from "@/lib/data/platform";
import { formatDate, formatMAD, formatPercent, toISODate, today } from "@/lib/format";
import { getAppLocale } from "@/lib/i18n/request-locale";
import { getLabels } from "@/lib/i18n/server";
import { formatPhone, toTelHref } from "@/lib/phone";
import { parsePeriod, periodOptions } from "@/lib/platform-period";

const STATUSES: readonly CenterStatus[] = ["trial", "active", "past_due", "suspended", "cancelled"];

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLabels()).platform.dashboard.title };
}

export default async function PlatformDashboardPage({ searchParams }: PageProps<"/platform">) {
  const [LABELS, locale, params] = await Promise.all([getLabels(), getAppLocale(), searchParams]);
  const L = LABELS.platform.dashboard;
  const C = LABELS.platformConsole;
  const REMINDER_KINDS: Record<string, string> = L.reminderKinds;
  const todayIso = toISODate(today());
  const period = parsePeriod(params, todayIso);
  const [{ overview, overdue, upcoming, notifications }, revenue] = await Promise.all([
    getPlatformDashboard(),
    getPlatformRevenue(period.selection),
  ]);
  const selected = revenue.selected;
  const planTotal = revenue.byPlan.reduce((sum, row) => sum + Number(row.revenue), 0);
  const chartMonths: RevenueMonth[] = [...revenue.months]
    .reverse()
    .map((row) => ({ month: row.month, revenue: Number(row.collected), current: row.month === `${todayIso.slice(0, 7)}-01` }));
  const money = (amount: number) => formatMAD(amount, locale, { cents: true });
  const planNames: Record<string, string> = LABELS.platform.plan;
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

      <section aria-labelledby="revenus" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <SectionHeading id="revenus" title={C.kpis.title} />
          <p className="text-caption text-muted-foreground">{C.kpis.description}</p>
        </div>
        <RevenueKpis kpis={revenue.kpis} />
      </section>

      <SectionCard title={C.period.title}>
        <PeriodSelector form={period.form} options={periodOptions(todayIso)} todayIso={todayIso} />
        {period.invalid ? (
          <p role="alert" className="text-caption font-medium text-danger-ink">
            {C.period.invalid}
          </p>
        ) : null}
        <div className="grid gap-6 border-t border-divider pt-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="flex flex-col gap-2">
            <p className="text-caption text-muted-foreground">
              {selected.period_start && selected.period_end
                ? C.kpis.range(formatDate(selected.period_start), formatDate(selected.period_end))
                : null}
            </p>
            <p className="numeric text-stat text-primary">{money(Number(selected.revenue ?? 0))}</p>
            <p className="text-caption text-muted-foreground">
              {C.period.revenue} · {C.period.payments(selected.payments_count ?? 0)}
            </p>
            <RevenueTrend
              change={selected.change_amount === null ? null : Number(selected.change_amount)}
              ratio={selected.change_ratio === null ? null : Number(selected.change_ratio)}
              comparedWith={
                selected.previous_start && selected.previous_end
                  ? `${C.period.previous(formatDate(selected.previous_start), formatDate(selected.previous_end))}${LABELS.common.colon} ${money(Number(selected.previous_revenue ?? 0))}`
                  : null
              }
            />
            {selected.to_date ? <p className="text-caption text-subtle">{C.period.toDate}</p> : null}
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-body font-semibold text-heading">{C.byPlan.title}</h3>
              {selected.period_start && selected.period_end ? (
                <p className="text-caption text-muted-foreground">
                  {C.byPlan.description(formatDate(selected.period_start), formatDate(selected.period_end))}
                </p>
              ) : null}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-start text-table">
                <caption className="sr-only">{C.byPlan.caption}</caption>
                <thead>
                  <tr className="h-10 border-b border-divider text-caption text-muted-foreground">
                    <th scope="col" className="px-2 font-medium">{C.byPlan.plan}</th>
                    <th scope="col" className="px-2 text-end font-medium">{C.byPlan.centers}</th>
                    <th scope="col" className="px-2 text-end font-medium">{C.byPlan.paying}</th>
                    <th scope="col" className="px-2 text-end font-medium">{C.byPlan.revenue}</th>
                    <th scope="col" className="px-2 text-end font-medium">{C.byPlan.share}</th>
                  </tr>
                </thead>
                <tbody>
                  {revenue.byPlan.map((row) => (
                    <tr key={row.plan_key} className="h-11 border-b border-divider">
                      <td className="px-2 font-medium text-heading">{planNames[row.plan_key] ?? row.plan_name}</td>
                      <td className="numeric px-2 text-end">{row.centers_count}</td>
                      <td className="numeric px-2 text-end">{row.paying_centers_count}</td>
                      <td className="numeric px-2 text-end">{money(Number(row.revenue))}</td>
                      <td className="numeric px-2 text-end text-muted-foreground">
                        {planTotal > 0 ? formatPercent(Number(row.revenue) / planTotal, locale) : "—"}
                      </td>
                    </tr>
                  ))}
                  <tr className="h-11 font-semibold text-heading">
                    <td className="px-2">{C.byPlan.total}</td>
                    <td className="numeric px-2 text-end">{revenue.byPlan.reduce((sum, row) => sum + row.centers_count, 0)}</td>
                    <td className="numeric px-2 text-end">{revenue.byPlan.reduce((sum, row) => sum + row.paying_centers_count, 0)}</td>
                    <td className="numeric px-2 text-end">{money(planTotal)}</td>
                    <td className="px-2" />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title={C.chart.title}>
        <RevenueChart months={chartMonths} />
      </SectionCard>

      <section aria-labelledby="statuts" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <SectionHeading id="statuts" title={L.centersByStatus} />
          <p className="text-caption text-muted-foreground">
            {overview.students_count} {L.students.toLowerCase()} · {overview.users_count} {L.users.toLowerCase()}
          </p>
        </div>
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
