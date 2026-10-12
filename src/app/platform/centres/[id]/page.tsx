import { ArrowLeft, KeyRound, Lock, Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/components/shared/app-link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { CenterActions, type CenterActionsData, ResendInvitationButton } from "@/components/platform/center-actions";
import { CenterAddressLinks, ChangeSlugDialog } from "@/components/platform/center-address";
import { CenterDeletionPanel } from "@/components/platform/center-deletion";
import { CenterExportList, ExportDialog } from "@/components/platform/center-exports";
import { ResetPasswordDialog } from "@/components/password/reset-password-dialog";
import { BrandingDialog } from "@/components/branding/branding-dialog";
import { CenterModules } from "@/components/platform/center-modules";
import { CenterStatusBadge } from "@/components/platform/center-status-badge";
import { DaysRemaining } from "@/components/platform/days-remaining";
import { eventDetail, eventLabel, eventReason } from "@/components/platform/event-text";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { Money } from "@/components/shared/money";
import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/auth/routes";
import type { AppLabels } from "@/lib/constants/labels";
import {
  type CenterPaymentTotal,
  getCenterExports,
  getCenterTypes,
  getPlanOptions,
  getPlatformCenterAdmins,
  getPlatformCenterFile,
  type PlatformCenterUser,
  type PlatformPayment,
} from "@/lib/data/platform";
import { formatDate, formatDateTime, formatMAD, formatMonth, toISODate, today } from "@/lib/format";
import type { Locale } from "@/lib/i18n/locale";
import { dnsTarget, getBrandingSettings } from "@/lib/branding";
import { centerAddressPattern, centerSlugHistory, centerUrl } from "@/lib/center-url";
import { getAppLocale } from "@/lib/i18n/request-locale";
import { getLabels } from "@/lib/i18n/server";
import { formatPhone, toTelHref } from "@/lib/phone";
import { customTermsSchema, EMPTY_TERMS } from "@/lib/validation/platform";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLabels()).platform.centers.title };
}

function paymentColumns(LABELS: AppLabels): readonly DataTableColumn<PlatformPayment>[] {
  const P = LABELS.platform;
  const L = P.center;
  return [
    { id: "paid", header: L.paidAt, mobile: "title", cell: (row) => <span className="numeric font-medium">{formatDate(row.paid_at)}</span> },
    { id: "amount", header: L.amount, align: "end", mobile: "aside", cell: (row) => <Money amount={row.amount} cents className="font-semibold" /> },
    {
      id: "period",
      header: L.periodCovered,
      mobile: "wide",
      cell: (row) =>
        row.period_covered_start && row.period_covered_end ? (
          <span className="numeric">{L.periodRange(formatDate(row.period_covered_start), formatDate(row.period_covered_end))}</span>
        ) : (
          "—"
        ),
    },
    { id: "method", header: L.method, cell: (row) => P.paymentMethod[row.method] },
    { id: "reference", header: L.reference, cell: (row) => row.reference ?? "—" },
    {
      id: "note",
      header: LABELS.platformConsole.payment.note,
      mobile: "wide",
      cell: (row) => (row.note ? <span className="whitespace-pre-line">{row.note}</span> : "—"),
    },
    { id: "by", header: L.recordedBy, cell: (row) => row.recorded_by_name ?? L.automatic },
  ];
}

function userColumns(centerId: string, canInvite: boolean, LABELS: AppLabels): readonly DataTableColumn<PlatformCenterUser>[] {
  const L = LABELS.platform.center;
  return [
    { id: "name", header: L.userName, mobile: "title", cell: (row) => <span className="font-medium text-heading">{row.full_name}</span> },
    { id: "email", header: L.userEmail, mobile: "wide", cell: (row) => <span className="break-all">{row.email}</span> },
    { id: "role", header: L.userRole, cell: (row) => LABELS.roles[row.role] },
    {
      id: "state",
      header: L.userState,
      mobile: "aside",
      cell: (row) => (
        <span className={row.active ? "text-success-ink" : "text-muted-foreground"}>{row.active ? L.userActive : L.userInactive}</span>
      ),
    },
    {
      id: "last",
      header: L.lastSignIn,
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-2">
          {row.last_sign_in_at ? <span className="numeric">{formatDateTime(row.last_sign_in_at)}</span> : L.never}
          {canInvite ? (
            <ResendInvitationButton
              centerId={centerId}
              userId={row.user_id}
              name={row.full_name}
              email={row.email}
              signedIn={row.confirmed || Boolean(row.last_sign_in_at)}
            />
          ) : null}
        </span>
      ),
    },
  ];
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${className ?? ""}`}>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium break-words text-heading">{children}</dd>
    </div>
  );
}

/** Totaux d'une granularité (mois, trimestre, année), du plus récent au plus ancien. */
function TotalsList({
  title,
  rows,
  label,
  LABELS,
  locale,
}: {
  title: string;
  rows: CenterPaymentTotal[];
  label: (row: CenterPaymentTotal) => string;
  LABELS: AppLabels;
  locale: Locale;
}) {
  const T = LABELS.platformConsole.sheet;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="text-caption font-semibold text-heading">{title}</h3>
      <ul className="flex max-h-72 flex-col divide-y divide-divider overflow-y-auto">
        {rows.map((row) => (
          <li key={`${row.granularity}-${row.period_start}`} className="flex flex-col py-2">
            <span className="capitalize">{label(row)}</span>
            <span className="numeric font-semibold whitespace-nowrap text-heading">
              {formatMAD(Number(row.total), locale, { cents: true })}
            </span>
            <span className="text-caption text-muted-foreground">{T.payments(row.payments_count)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function PlatformCenterPage({ params }: PageProps<"/platform/centres/[id]">) {
  const [LABELS, locale] = await Promise.all([getLabels(), getAppLocale()]);
  const P = LABELS.platform;
  const L = P.center;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [file, types, brandingSettings, plans, addressPattern, slugHistory, admins, exports] = await Promise.all([
    getPlatformCenterFile(id),
    getCenterTypes(),
    getBrandingSettings(id),
    getPlanOptions(),
    centerAddressPattern(),
    centerSlugHistory(id),
    getPlatformCenterAdmins(id),
    getCenterExports(id),
  ]);
  if (!file) notFound();
  const { center, users, events, payments, modules, overview, totals, deletion } = file;
  const purged = Boolean(deletion?.purged_at);
  const C = LABELS.platformConsole;
  const totalsOf = (granularity: string) => totals.filter((row) => row.granularity === granularity);
  const address = await centerUrl(center.slug, "");
  const moduleNames = Object.fromEntries(modules.map((module) => [module.module_key, module.name]));
  const whiteLabel = modules.some((module) => module.module_key === "white_label" && module.is_enabled);
  const tel = center.owner_contact_phone ? toTelHref(center.owner_contact_phone) : null;
  const branding = center.branding;
  const terms = customTermsSchema.safeParse(center.custom_terms);
  const actionsData: CenterActionsData = {
    centerId: center.center_id,
    status: center.status,
    name: center.name,
    slug: center.slug,
    centerType: center.center_type,
    customTerms: terms.success ? terms.data : EMPTY_TERMS,
    ownerName: center.owner_contact_name ?? "",
    ownerPhone: center.owner_contact_phone ?? "",
    ownerEmail: center.owner_contact_email ?? "",
    notes: center.notes ?? "",
    plan: center.plan_key,
    plans,
    price: center.price,
    billingInterval: center.billing_interval,
    graceDays: center.grace_days,
    dueDate: center.current_period_end,
    todayIso: toISODate(today()),
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Button asChild variant="ghost" className="w-fit px-2">
          <Link href={ROUTES.platform.centers}>
            <ArrowLeft aria-hidden />
            {L.back}
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-title text-heading">{center.name}</h1>
          <CenterStatusBadge status={center.status} />
        </div>
        <p className="text-muted-foreground">
          {center.center_type_label} · {center.plan_name}
        </p>
        {purged ? null : <CenterActions data={actionsData} types={types} />}
        {center.status === "suspended" && overview?.suspension_kind ? (
          <div role="status" className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3">
            <Lock className="mt-0.5 size-5 shrink-0 text-danger-ink" aria-hidden />
            <div className="flex flex-col gap-0.5">
              <p className="font-medium text-heading">
                {C.access.banner(
                  C.access.kinds[overview.suspension_kind] ?? overview.suspension_kind,
                  overview.suspended_at ? formatDate(overview.suspended_at) : "—",
                )}
              </p>
              {overview.suspension_note ? <p className="text-caption text-foreground">{P.reason(overview.suspension_note)}</p> : null}
              <p className="text-caption text-muted-foreground">
                {overview.suspension_kind === "unpaid" ? C.access.bannerUnpaid : C.access.bannerManual}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title={L.identity}>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={L.slug} className="sm:col-span-2">
              <div className="flex flex-col gap-2">
                <CenterAddressLinks url={address} />
                {center.status !== "cancelled" ? (
                  <div>
                    <ChangeSlugDialog centerId={center.center_id} slug={center.slug} pattern={addressPattern} />
                  </div>
                ) : null}
                {slugHistory.length > 0 ? (
                  <p className="text-caption font-normal text-muted-foreground">
                    {L.formerSlugs(slugHistory.map((entry) => entry.slug).join(", "))}
                  </p>
                ) : null}
              </div>
            </Field>
            <Field label={L.type}>{center.center_type_label}</Field>
            <Field label={L.createdAt}>{formatDate(center.created_at)}</Field>
            <Field label={L.activatedAt}>{center.activated_at ? formatDate(center.activated_at) : "—"}</Field>
            {center.cancelled_at ? <Field label={L.cancelledAt}>{formatDate(center.cancelled_at)}</Field> : null}
            <Field label={L.students}>{center.students_count}</Field>
            <Field label={L.users}>{center.users_count}</Field>
          </dl>
          <div className="flex flex-col gap-2 border-t border-divider pt-4">
            <p className="text-caption text-muted-foreground">{L.contact}</p>
            <p className="font-medium text-heading">{center.owner_contact_name ?? P.notSet}</p>
            <div className="flex flex-wrap gap-2">
              {tel && center.owner_contact_phone ? (
                <Button asChild variant="outline">
                  <a href={tel}>
                    <Phone aria-hidden />
                    <span className="numeric">{formatPhone(center.owner_contact_phone)}</span>
                  </a>
                </Button>
              ) : null}
              {center.owner_contact_email ? (
                <Button asChild variant="outline">
                  <a href={`mailto:${center.owner_contact_email}`}>
                    <Mail aria-hidden />
                    <span className="break-all">{center.owner_contact_email}</span>
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-1 border-t border-divider pt-4">
            <p className="text-caption text-muted-foreground">{L.notes}</p>
            <p className="whitespace-pre-line">{center.notes ?? L.noNotes}</p>
          </div>
        </SectionCard>

        <SectionCard title={L.subscription}>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={L.plan}>{center.plan_name}</Field>
            <Field label={L.price}>
              {center.price === null ? (
                P.notSet
              ) : (
                <>
                  <Money amount={center.price} /> {P.interval[center.billing_interval]}
                </>
              )}
            </Field>
            <Field label={L.dueDate}>
              {center.current_period_end ? (
                <span className="flex flex-col">
                  <span className="numeric">{formatDate(center.current_period_end)}</span>
                  <DaysRemaining days={center.days_remaining} className="text-caption" />
                </span>
              ) : (
                P.noDueDate
              )}
            </Field>
            <Field label={L.periodStart}>{center.current_period_start ? formatDate(center.current_period_start) : "—"}</Field>
            <Field label={L.graceDays}>{L.graceDaysValue(center.grace_days)}</Field>
            <Field label={L.autoRenew}>{center.auto_renew === false ? L.no : L.yes}</Field>
          </dl>
        </SectionCard>
      </div>

      <SectionCard title={P.modules.title} description={P.modules.description}>
        <CenterModules centerId={center.center_id} modules={modules} />
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title={C.sheet.activity} description={C.sheet.activityNote}>
          {overview ? (
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label={C.sheet.students}>
                <span className="flex flex-col">
                  <span className="numeric">{overview.students_count}</span>
                  <span className="text-caption font-normal text-muted-foreground">{C.sheet.activeStudents(overview.active_students)}</span>
                </span>
              </Field>
              <Field label={C.sheet.teachers}>
                <span className="numeric">{overview.teachers_count}</span>
              </Field>
              <Field label={C.sheet.assistants}>
                <span className="numeric">{overview.assistants_count}</span>
              </Field>
              <Field label={C.sheet.admins}>
                <span className="numeric">{overview.admins_count}</span>
              </Field>
              <Field label={C.sheet.studentAccounts}>
                <span className="numeric">{overview.student_accounts_count}</span>
              </Field>
              <Field label={C.sheet.lastAdminSignIn}>
                {overview.last_admin_sign_in_at ? (
                  <span className="numeric">{formatDateTime(overview.last_admin_sign_in_at)}</span>
                ) : (
                  C.sheet.never
                )}
              </Field>
            </dl>
          ) : null}
        </SectionCard>

        <SectionCard title={C.sheet.totals}>
          {totals.length === 0 ? (
            <p className="text-muted-foreground">{C.sheet.totalsEmpty}</p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-3">
              <TotalsList
                title={C.sheet.byMonth}
                rows={totalsOf("month").slice(0, 12)}
                label={(row) => formatMonth(row.period_start, locale)}
                LABELS={LABELS}
                locale={locale}
              />
              <TotalsList
                title={C.sheet.byQuarter}
                rows={totalsOf("quarter").slice(0, 8)}
                label={(row) => {
                  const [year, month] = row.period_start.split("-").map(Number);
                  return C.sheet.quarter(Math.floor((month - 1) / 3) + 1, year);
                }}
                LABELS={LABELS}
                locale={locale}
              />
              <TotalsList
                title={C.sheet.byYear}
                rows={totalsOf("year")}
                label={(row) => row.period_start.slice(0, 4)}
                LABELS={LABELS}
                locale={locale}
              />
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title={C.exports.listTitle}
        aside={purged ? null : <ExportDialog centerId={center.center_id} todayIso={actionsData.todayIso} />}
      >
        <CenterExportList exports={exports} />
      </SectionCard>

      <SectionCard title={C.deletion.title}>
        <CenterDeletionPanel
          centerId={center.center_id}
          name={center.name}
          status={center.status}
          deletion={deletion}
          hasReadyExport={exports.some((item) => item.status === "ready")}
          todayIso={actionsData.todayIso}
        />
      </SectionCard>

      <SectionCard title={L.payments}>
        {payments.length === 0 ? (
          <p className="text-muted-foreground">{L.paymentsEmpty}</p>
        ) : (
          <DataTable columns={paymentColumns(LABELS)} rows={payments} getRowId={(row) => row.payment_id} caption={L.payments} variant="plain" />
        )}
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title={L.branding}
          aside={
            whiteLabel && brandingSettings ? (
              <BrandingDialog
                defaults={{ centerId: center.center_id, ...brandingSettings.values }}
                domainVerified={brandingSettings.domainVerified}
                dnsTarget={dnsTarget()}
              />
            ) : null
          }
        >
          {!whiteLabel ? (
            <p className="text-muted-foreground">{L.brandingStandard}</p>
          ) : !branding ? (
            <p className="text-muted-foreground">{L.brandingEmpty}</p>
          ) : (
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={L.brandName}>{branding.brand_name ?? P.notSet}</Field>
              <Field label={L.colors}>
                <span className="flex gap-2">
                  {[branding.primary_color, branding.secondary_color, branding.accent_color].map((color, index) =>
                    color ? (
                      <span
                        key={index}
                        className="size-6 rounded-full border border-divider"
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ) : null,
                  )}
                </span>
              </Field>
              <Field label={L.customDomain}>
                {branding.custom_domain ? (
                  <span className="flex flex-col">
                    <span className="break-all">{branding.custom_domain}</span>
                    <span className="text-caption text-muted-foreground">
                      {branding.domain_verified ? L.domainVerified : L.domainPending}
                    </span>
                  </span>
                ) : (
                  P.notSet
                )}
              </Field>
              <Field label={L.supportContact}>
                {[branding.support_email, branding.support_phone].filter(Boolean).join(" · ") || P.notSet}
              </Field>
            </dl>
          )}
        </SectionCard>

        <SectionCard title={L.history}>
          {events.length === 0 ? (
            <p className="text-muted-foreground">{L.historyEmpty}</p>
          ) : (
            <ol className="flex max-h-[420px] flex-col divide-y divide-divider overflow-y-auto">
              {events.map((event) => {
                const detail = eventDetail(event, LABELS, locale, moduleNames);
                const reason = eventReason(event);
                return (
                  <li key={event.event_id} className="flex flex-col gap-0.5 py-3">
                    <span className="font-medium text-heading">
                      {eventLabel(event.action, P)}
                      {detail ? <span className="font-normal text-foreground"> · {detail}</span> : null}
                    </span>
                    {reason ? <span className="text-caption text-foreground">{P.reason(reason)}</span> : null}
                    <span className="text-caption text-muted-foreground">
                      {formatDateTime(event.occurred_at)} · {event.actor_name ?? L.automatic}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </SectionCard>
      </div>

      <SectionCard title={admins.length > 1 ? LABELS.passwords.admins.titlePlural : LABELS.passwords.admins.title}>
        {admins.length === 0 ? (
          <p className="text-muted-foreground">{LABELS.passwords.admins.none}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-divider">
            {admins.map((admin) => (
              <li key={admin.user_id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col">
                  <span className="font-medium text-heading">{admin.full_name}</span>
                  <span className="text-caption break-all text-muted-foreground">{admin.email}</span>
                  <span className="text-caption text-muted-foreground">
                    {C.sheet.phone}
                    {LABELS.common.colon}{" "}
                    {admin.phone ? (
                      <a href={toTelHref(admin.phone) ?? undefined} className="numeric text-primary hover:underline">
                        {formatPhone(admin.phone)}
                      </a>
                    ) : (
                      C.sheet.noPhone
                    )}
                  </span>
                  <span className="text-caption text-muted-foreground">
                    {LABELS.passwords.admins.lastSignIn}{LABELS.common.colon}{" "}
                    {admin.last_sign_in_at ? formatDateTime(admin.last_sign_in_at) : LABELS.passwords.admins.never}
                  </span>
                  {admin.last_reset_at ? (
                    <span className="text-caption text-muted-foreground">{LABELS.passwords.lastResetByYou(formatDateTime(admin.last_reset_at))}</span>
                  ) : null}
                </div>
                {admin.active && center.status !== "cancelled" ? (
                  <ResetPasswordDialog
                    target={{ userId: admin.user_id }}
                    name={admin.full_name}
                    trigger={
                      <Button type="button" variant="outline" className="self-start sm:self-center">
                        <KeyRound aria-hidden />
                        {LABELS.passwords.resetAdmin}
                      </Button>
                    }
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={L.usersTitle}>
        {users.length === 0 ? (
          <p className="text-muted-foreground">{L.usersEmpty}</p>
        ) : (
          <DataTable columns={userColumns(center.center_id, center.status !== "cancelled", LABELS)} rows={users} getRowId={(row) => row.user_id} caption={L.usersTitle} variant="plain" />
        )}
      </SectionCard>
    </div>
  );
}
