import { ArrowLeft, Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { CenterActions, type CenterActionsData, ResendInvitationButton } from "@/components/platform/center-actions";
import { CenterStatusBadge } from "@/components/platform/center-status-badge";
import { DaysRemaining } from "@/components/platform/days-remaining";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { Money } from "@/components/shared/money";
import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/auth/routes";
import { LABELS } from "@/lib/constants/labels";
import {
  getCenterTypes,
  getPlatformCenterFile,
  type PlatformCenterUser,
  type PlatformEvent,
  type PlatformPayment,
} from "@/lib/data/platform";
import { formatDate, formatDateTime, toISODate, today } from "@/lib/format";
import { formatPhone, toTelHref } from "@/lib/phone";
import { customTermsSchema, EMPTY_TERMS } from "@/lib/validation/platform";

const P = LABELS.platform;
const L = P.center;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: P.centers.title };

const PAYMENT_COLUMNS: readonly DataTableColumn<PlatformPayment>[] = [
  { id: "paid", header: L.paidAt, mobile: "title", cell: (row) => <span className="numeric font-medium">{formatDate(row.paid_at)}</span> },
  { id: "amount", header: L.amount, align: "end", mobile: "aside", cell: (row) => <Money amount={row.amount} className="font-semibold" /> },
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
  { id: "by", header: L.recordedBy, cell: (row) => row.recorded_by_name ?? L.automatic },
];

const userColumns = (centerId: string, canInvite: boolean): readonly DataTableColumn<PlatformCenterUser>[] => [
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
            signedIn={row.confirmed || Boolean(row.last_sign_in_at)}
          />
        ) : null}
      </span>
    ),
  },
];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium break-words text-heading">{children}</dd>
    </div>
  );
}

function eventLabel(action: string): string {
  const labels: Record<string, string> = P.events;
  return labels[action] ?? P.eventFallback;
}

function eventDetail(event: PlatformEvent): string | null {
  const payload = event.payload;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const from = typeof payload.from === "string" ? payload.from : null;
  const to = typeof payload.to === "string" ? payload.to : null;
  const statusLabels: Record<string, string> = P.centerStatus;
  const planLabels: Record<string, string> = P.plan;
  switch (event.action) {
    case "center.status_changed":
      return from && to ? `${statusLabels[from] ?? from} → ${statusLabels[to] ?? to}` : null;
    case "subscription.plan_changed":
      return from && to ? `${planLabels[from] ?? from} → ${planLabels[to] ?? to}` : null;
    case "center.period_changed":
      return to ? `${from ? `${formatDate(from)} → ` : ""}${formatDate(to)}` : null;
    case "subscription.payment_recorded":
      return typeof payload.amount === "number" ? `${payload.amount} ${LABELS.currency.code}` : null;
    case "center.admin_invited":
      return typeof payload.email === "string" ? payload.email : null;
    default:
      return null;
  }
}

function eventReason(event: PlatformEvent): string | null {
  const payload = event.payload;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  return typeof payload.reason === "string" ? payload.reason : null;
}

export default async function PlatformCenterPage({ params }: PageProps<"/platform/centres/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [file, types] = await Promise.all([getPlatformCenterFile(id), getCenterTypes()]);
  if (!file) notFound();
  const { center, users, events, payments } = file;
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
    plan: center.plan ?? "standard",
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
          {center.center_type_label} · {center.plan ? P.plan[center.plan] : P.notSet}
        </p>
        <CenterActions data={actionsData} types={types} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title={L.identity}>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={L.slug}>{center.slug}</Field>
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
            <Field label={L.plan}>{center.plan ? P.plan[center.plan] : P.notSet}</Field>
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

      <SectionCard title={L.payments}>
        {payments.length === 0 ? (
          <p className="text-muted-foreground">{L.paymentsEmpty}</p>
        ) : (
          <DataTable columns={PAYMENT_COLUMNS} rows={payments} getRowId={(row) => row.payment_id} caption={L.payments} variant="plain" />
        )}
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title={L.branding}>
          {center.plan !== "white_label" ? (
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
                const detail = eventDetail(event);
                const reason = eventReason(event);
                return (
                  <li key={event.event_id} className="flex flex-col gap-0.5 py-3">
                    <span className="font-medium text-heading">
                      {eventLabel(event.action)}
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

      <SectionCard title={L.usersTitle}>
        {users.length === 0 ? (
          <p className="text-muted-foreground">{L.usersEmpty}</p>
        ) : (
          <DataTable columns={userColumns(center.center_id, center.status !== "cancelled")} rows={users} getRowId={(row) => row.user_id} caption={L.usersTitle} variant="plain" />
        )}
      </SectionCard>
    </div>
  );
}
