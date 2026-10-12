import { Building2, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/components/shared/app-link";

import { FilterChips, type FilterOption } from "@/components/admin/filter-chips";
import { RecordPaymentDialog } from "@/components/platform/center-actions";
import { CenterAddressLinks } from "@/components/platform/center-address";
import { CenterStatusBadge } from "@/components/platform/center-status-badge";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/lib/auth/routes";
import { addressFor } from "@/lib/center-host";
import { centerAddressPattern } from "@/lib/center-url";
import type { AppLabels } from "@/lib/constants/labels";
import { type CenterBillingRow, type CenterStatus, getCenterTypes, getCentersBilling, getPlanOptions } from "@/lib/data/platform";
import { formatDate, formatMAD, toISODate, today } from "@/lib/format";
import { getAppLocale } from "@/lib/i18n/request-locale";
import { getLabels } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLabels()).platform.centers.title };
}

const STATUSES: readonly CenterStatus[] = ["trial", "active", "past_due", "suspended", "cancelled"];

/** Colonnes triables (paramètre « tri ») et valeur comparée. */
const SORTS = {
  name: (row: CenterBillingRow) => row.name.toLocaleLowerCase("fr"),
  address: (row: CenterBillingRow) => row.slug,
  plan: (row: CenterBillingRow) => row.plan_name,
  status: (row: CenterBillingRow) => STATUSES.indexOf(row.status),
  lastPayment: (row: CenterBillingRow) => row.last_payment_at ?? "",
  lastAmount: (row: CenterBillingRow) => Number(row.last_payment_amount ?? -1),
  nextDue: (row: CenterBillingRow) => row.current_period_end ?? "9999-12-31",
  amountDue: (row: CenterBillingRow) => Number(row.amount_due),
  daysLate: (row: CenterBillingRow) => row.days_overdue,
  students: (row: CenterBillingRow) => row.active_students,
} as const;
type SortKey = keyof typeof SORTS;

type Filters = { q: string; statut: string | null; type: string | null; pack: string | null; tri: SortKey; ordre: "asc" | "desc" };

function first(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v ? v : null;
}

function hrefWith(filters: Filters, patch: Partial<Filters>): string {
  const next = { ...filters, ...patch };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.statut) params.set("statut", next.statut);
  if (next.type) params.set("type", next.type);
  if (next.pack) params.set("pack", next.pack);
  if (next.tri !== "name" || next.ordre !== "asc") {
    params.set("tri", next.tri);
    params.set("ordre", next.ordre);
  }
  const query = params.toString();
  return query ? `${ROUTES.platform.centers}?${query}` : ROUTES.platform.centers;
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function columns(
  addressPattern: string,
  LABELS: AppLabels,
  filters: Filters,
  todayIso: string,
): readonly DataTableColumn<CenterBillingRow>[] {
  const P = LABELS.platform;
  const L = P.centers;
  const C = LABELS.platformConsole.centers;
  const sort = (key: SortKey, header: string): DataTableColumn<CenterBillingRow>["sort"] => {
    const active = filters.tri === key;
    const direction = active ? filters.ordre : null;
    return {
      href: hrefWith(filters, { tri: key, ordre: active && filters.ordre === "asc" ? "desc" : "asc" }),
      direction,
      label: `${C.sortBy(header)}${direction ? ` (${direction === "asc" ? C.sortedAsc : C.sortedDesc})` : ""}`,
    };
  };
  return [
    {
      id: "name",
      header: L.name,
      mobile: "title",
      sort: sort("name", L.name),
      cell: (row) => (
        <Link
          href={`${ROUTES.platform.centers}/${row.center_id}`}
          className="block truncate rounded-sm font-semibold text-heading hover:text-primary"
        >
          {row.name}
        </Link>
      ),
    },
    {
      id: "address",
      header: L.address,
      mobile: "wide",
      sort: sort("address", L.address),
      cell: (row) => <CenterAddressLinks url={addressFor(addressPattern, row.slug)} compact />,
    },
    { id: "plan", header: L.plan, sort: sort("plan", L.plan), cell: (row) => (P.plan as Record<string, string>)[row.plan_key] ?? row.plan_name },
    {
      id: "status",
      header: L.status,
      mobile: "aside",
      sort: sort("status", L.status),
      cell: (row) => (
        <span className="flex flex-col items-start gap-1">
          <CenterStatusBadge status={row.status} />
          {row.days_overdue > 0 ? (
            <span className="text-caption font-medium whitespace-nowrap text-danger-ink">{C.lateBy(row.days_overdue)}</span>
          ) : null}
        </span>
      ),
    },
    {
      id: "lastPayment",
      header: C.lastPayment,
      sort: sort("lastPayment", C.lastPayment),
      cell: (row) =>
        row.last_payment_at ? <span className="numeric">{formatDate(row.last_payment_at)}</span> : <span className="text-muted-foreground">{C.noPayment}</span>,
    },
    {
      id: "lastAmount",
      header: C.lastAmount,
      align: "end",
      sort: sort("lastAmount", C.lastAmount),
      cell: (row) => (row.last_payment_amount === null ? "—" : <Money amount={Number(row.last_payment_amount)} cents />),
    },
    {
      id: "nextDue",
      header: C.nextDue,
      sort: sort("nextDue", C.nextDue),
      cell: (row) =>
        row.current_period_end ? (
          <span className={cn("numeric", row.current_period_end < todayIso && row.status !== "cancelled" && "text-danger-ink")}>
            {formatDate(row.current_period_end)}
          </span>
        ) : (
          <span className="text-muted-foreground">{P.noDueDate}</span>
        ),
    },
    {
      id: "amountDue",
      header: C.amountDue,
      align: "end",
      sort: sort("amountDue", C.amountDue),
      cell: (row) =>
        Number(row.amount_due) > 0 ? (
          <Money amount={Number(row.amount_due)} cents className="font-semibold text-heading" />
        ) : (
          <span className="text-muted-foreground">{C.upToDate}</span>
        ),
    },
    {
      id: "daysLate",
      header: C.daysLate,
      align: "end",
      sort: sort("daysLate", C.daysLate),
      cell: (row) =>
        row.days_overdue > 0 ? (
          <span className="numeric font-medium text-danger-ink">{row.days_overdue}</span>
        ) : row.current_period_end === todayIso && row.status !== "cancelled" ? (
          <span className="text-caption text-warning-ink">{C.dueToday}</span>
        ) : (
          <span className="numeric text-muted-foreground">0</span>
        ),
    },
    {
      id: "students",
      header: C.activeStudents,
      align: "end",
      sort: sort("students", C.activeStudents),
      cell: (row) => <span className="numeric">{row.active_students}</span>,
    },
    {
      id: "record",
      header: P.actions.title,
      mobile: "wide",
      cell: (row) =>
        row.status === "cancelled" ? null : (
          <RecordPaymentDialog
            compact
            centerName={row.name}
            data={{ centerId: row.center_id, price: row.price === null ? null : Number(row.price), billingInterval: row.billing_interval, todayIso }}
          />
        ),
    },
  ];
}

export default async function PlatformCentersPage({ searchParams }: PageProps<"/platform/centres">) {
  const [LABELS, locale, params] = await Promise.all([getLabels(), getAppLocale(), searchParams]);
  const P = LABELS.platform;
  const L = P.centers;
  const C = LABELS.platformConsole.centers;
  const [centers, types, plans, addressPattern] = await Promise.all([
    getCentersBilling(),
    getCenterTypes(),
    getPlanOptions(),
    centerAddressPattern(),
  ]);
  const todayIso = toISODate(today());

  const statut = first(params.statut);
  const type = first(params.type);
  const pack = first(params.pack);
  const tri = first(params.tri);
  const filters: Filters = {
    q: first(params.q) ?? "",
    statut: STATUSES.find((s) => s === statut) ?? null,
    type: type && types.some((t) => t.code === type) ? type : null,
    pack: plans.find((p) => p.key === pack)?.key ?? null,
    tri: tri && tri in SORTS ? (tri as SortKey) : "name",
    ordre: first(params.ordre) === "desc" ? "desc" : "asc",
  };

  const query = normalize(filters.q.trim());
  const value = SORTS[filters.tri];
  const rows = centers
    .filter(
      (row) =>
        (!query || normalize(`${row.name} ${row.slug}`).includes(query)) &&
        (!filters.statut || row.status === filters.statut) &&
        (!filters.type || row.center_type === filters.type) &&
        (!filters.pack || row.plan_key === filters.pack),
    )
    .sort((a, b) => {
      const [x, y] = [value(a), value(b)];
      const order = x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name, "fr");
      return filters.ordre === "asc" ? order : -order;
    });

  // Synthèse : tous les centres, quels que soient les filtres.
  const count = (status: CenterStatus) => centers.filter((row) => row.status === status).length;
  const owing = centers.filter((row) => Number(row.amount_due) > 0);
  const totalDue = owing.reduce((sum, row) => sum + Number(row.amount_due), 0);
  const summary = [
    { key: "active", label: C.active, value: String(count("active")), href: hrefWith(filters, { statut: "active" }) },
    { key: "trial", label: C.trial, value: String(count("trial")), href: hrefWith(filters, { statut: "trial" }) },
    { key: "past_due", label: C.pastDue, value: String(count("past_due")), href: hrefWith(filters, { statut: "past_due" }), alert: count("past_due") > 0 },
    { key: "suspended", label: C.suspended, value: String(count("suspended")), href: hrefWith(filters, { statut: "suspended" }) },
  ];

  const statusOptions: FilterOption[] = [
    { value: null, label: L.allStatuses },
    ...STATUSES.map((s) => ({ value: s, label: P.centerStatus[s] })),
  ];
  const typeOptions: FilterOption[] = [{ value: null, label: L.allTypes }, ...types.map((t) => ({ value: t.code, label: t.label }))];
  const planOptions: FilterOption[] = [
    { value: null, label: L.allPlans },
    ...plans.map((p) => ({ value: p.key, label: (P.plan as Record<string, string>)[p.key] ?? p.name })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={L.title}
        description={L.description}
        actions={
          <>
            <Button asChild>
              <Link href={ROUTES.platform.newCenter}>
                <Plus aria-hidden />
                {P.newCenter.open}
              </Link>
            </Button>
            <form action={ROUTES.platform.centers} role="search" className="flex w-full gap-2 sm:w-auto">
              {filters.statut ? <input type="hidden" name="statut" value={filters.statut} /> : null}
              {filters.type ? <input type="hidden" name="type" value={filters.type} /> : null}
              {filters.pack ? <input type="hidden" name="pack" value={filters.pack} /> : null}
              <label className="sr-only" htmlFor="recherche-centre">
                {L.searchLabel}
              </label>
              <Input
                id="recherche-centre"
                type="search"
                name="q"
                defaultValue={filters.q}
                placeholder={L.searchPlaceholder}
                className="w-full font-normal sm:w-72"
              />
              <Button type="submit" variant="outline" aria-label={L.search}>
                <Search aria-hidden />
              </Button>
            </form>
          </>
        }
      />

      <section aria-label={C.summaryTitle}>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {summary.map((item) => (
            <li key={item.key}>
              <Link href={item.href} className="card-interactive flex h-full flex-col gap-1 rounded-xl bg-card px-5 py-4 shadow-card">
                <span className={cn("numeric text-stat", item.alert ? "text-danger-ink" : "text-heading")}>{item.value}</span>
                <span className="text-caption text-muted-foreground">{item.label}</span>
              </Link>
            </li>
          ))}
          <li className="col-span-2 md:col-span-1">
            <div className="flex h-full flex-col gap-1 rounded-xl bg-card px-5 py-4 shadow-card">
              <span className={cn("numeric text-stat", totalDue > 0 ? "text-danger-ink" : "text-heading")}>
                {formatMAD(totalDue, locale, { cents: true })}
              </span>
              <span className="text-caption text-muted-foreground">{C.totalDue}</span>
              {owing.length > 0 ? <span className="text-caption text-subtle">{C.totalDueDetail(owing.length)}</span> : null}
            </div>
          </li>
        </ul>
      </section>

      <div className="flex flex-col gap-3">
        <FilterChips label={L.filterStatus} options={statusOptions} current={filters.statut} href={(v) => hrefWith(filters, { statut: v })} />
        <FilterChips label={L.filterPlan} options={planOptions} current={filters.pack} href={(v) => hrefWith(filters, { pack: v })} />
        <FilterChips label={L.filterType} options={typeOptions} current={filters.type} href={(v) => hrefWith(filters, { type: v })} />
      </div>

      <p className="text-section">{L.count(rows.length)}</p>

      {rows.length === 0 ? (
        <EmptyState icon={Building2} title={L.empty} description={L.emptyDescription} />
      ) : (
        <DataTable
          columns={columns(addressPattern, LABELS, filters, todayIso)}
          rows={rows}
          getRowId={(row) => row.center_id}
          caption={L.caption}
        />
      )}
    </div>
  );
}
