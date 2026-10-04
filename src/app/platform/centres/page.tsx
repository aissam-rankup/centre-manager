import { Building2, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { FilterChips, type FilterOption } from "@/components/admin/filter-chips";
import { CenterStatusBadge } from "@/components/platform/center-status-badge";
import { DaysRemaining } from "@/components/platform/days-remaining";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/lib/auth/routes";
import { LABELS } from "@/lib/constants/labels";
import {
  type CenterStatus,
  getCenterTypes,
  getPlanOptions,
  getPlatformCenters,
  type PlatformCenterRow,
} from "@/lib/data/platform";
import { formatDate } from "@/lib/format";

const L = LABELS.platform.centers;
const P = LABELS.platform;

export const metadata: Metadata = { title: L.title };

const STATUSES: readonly CenterStatus[] = ["trial", "active", "past_due", "suspended", "cancelled"];

const COLUMNS: readonly DataTableColumn<PlatformCenterRow>[] = [
  {
    id: "name",
    header: L.name,
    mobile: "title",
    cell: (row) => (
      <span className="flex min-w-0 flex-col">
        <Link
          href={`${ROUTES.platform.centers}/${row.center_id}`}
          className="truncate rounded-sm font-semibold text-heading hover:text-primary"
        >
          {row.name}
        </Link>
        <span className="truncate text-caption text-muted-foreground">{row.slug}</span>
      </span>
    ),
  },
  { id: "type", header: L.type, cell: (row) => row.center_type_label },
  { id: "plan", header: L.plan, cell: (row) => row.plan_name },
  { id: "status", header: L.status, mobile: "aside", cell: (row) => <CenterStatusBadge status={row.status} /> },
  {
    id: "activated",
    header: L.activatedAt,
    mobile: "hidden",
    cell: (row) => (row.activated_at ? <span className="numeric">{formatDate(row.activated_at)}</span> : "—"),
  },
  {
    id: "due",
    header: L.dueDate,
    cell: (row) => (row.current_period_end ? <span className="numeric">{formatDate(row.current_period_end)}</span> : "—"),
  },
  { id: "remaining", header: L.remaining, cell: (row) => <DaysRemaining days={row.days_remaining} /> },
  { id: "students", header: L.students, align: "end", cell: (row) => <span className="numeric">{row.students_count}</span> },
  {
    id: "price",
    header: L.price,
    align: "end",
    cell: (row) =>
      row.price === null ? (
        <span className="text-muted-foreground">{P.notSet}</span>
      ) : (
        <span className="whitespace-nowrap">
          <Money amount={row.price} /> <span className="text-caption text-muted-foreground">{P.intervalShort[row.billing_interval]}</span>
        </span>
      ),
  },
];

type Filters = { q: string; statut: string | null; type: string | null; pack: string | null };

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
  const query = params.toString();
  return query ? `${ROUTES.platform.centers}?${query}` : ROUTES.platform.centers;
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export default async function PlatformCentersPage({ searchParams }: PageProps<"/platform/centres">) {
  const params = await searchParams;
  const [centers, types, plans] = await Promise.all([getPlatformCenters(), getCenterTypes(), getPlanOptions()]);

  const statut = first(params.statut);
  const type = first(params.type);
  const pack = first(params.pack);
  const filters: Filters = {
    q: first(params.q) ?? "",
    statut: STATUSES.find((s) => s === statut) ?? null,
    type: type && types.some((t) => t.code === type) ? type : null,
    pack: plans.find((p) => p.key === pack)?.key ?? null,
  };

  const query = normalize(filters.q.trim());
  const rows = centers.filter(
    (row) =>
      (!query || normalize(`${row.name} ${row.slug}`).includes(query)) &&
      (!filters.statut || row.status === filters.statut) &&
      (!filters.type || row.center_type === filters.type) &&
      (!filters.pack || row.plan_key === filters.pack),
  );

  const statusOptions: FilterOption[] = [
    { value: null, label: L.allStatuses },
    ...STATUSES.map((s) => ({ value: s, label: P.centerStatus[s] })),
  ];
  const typeOptions: FilterOption[] = [{ value: null, label: L.allTypes }, ...types.map((t) => ({ value: t.code, label: t.label }))];
  const planOptions: FilterOption[] = [{ value: null, label: L.allPlans }, ...plans.map((p) => ({ value: p.key, label: p.name }))];

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

      <div className="flex flex-col gap-3">
        <FilterChips label={L.filterStatus} options={statusOptions} current={filters.statut} href={(v) => hrefWith(filters, { statut: v })} />
        <FilterChips label={L.filterType} options={typeOptions} current={filters.type} href={(v) => hrefWith(filters, { type: v })} />
        <FilterChips label={L.filterPlan} options={planOptions} current={filters.pack} href={(v) => hrefWith(filters, { pack: v })} />
      </div>

      <p className="text-section">{L.count(rows.length)}</p>

      {rows.length === 0 ? (
        <EmptyState icon={Building2} title={L.empty} description={L.emptyDescription} />
      ) : (
        <DataTable columns={COLUMNS} rows={rows} getRowId={(row) => row.center_id} caption={L.caption} />
      )}
    </div>
  );
}
