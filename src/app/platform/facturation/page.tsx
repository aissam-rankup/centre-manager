import { Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/components/shared/app-link";

import { StatTile, StatTiles } from "@/components/dashboard/stat-tile";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { ROUTES } from "@/lib/auth/routes";
import { LABELS } from "@/lib/constants/labels";
import { type BillingMonth, getPlatformBilling, type PlatformPayment } from "@/lib/data/platform";
import { formatDate, formatMAD, formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";

const P = LABELS.platform;
const L = P.billing;

export const metadata: Metadata = { title: L.title };

function Gap({ value }: { value: number }) {
  return (
    <span className={cn("numeric whitespace-nowrap", value < 0 ? "text-danger-ink" : value > 0 ? "text-success-ink" : "text-muted-foreground")}>
      {value > 0 ? "+" : ""}
      {formatMAD(value)}
    </span>
  );
}

const MONTH_COLUMNS: readonly DataTableColumn<BillingMonth>[] = [
  { id: "month", header: L.month, mobile: "title", cell: (row) => <span className="font-medium capitalize">{formatMonth(row.month)}</span> },
  { id: "collected", header: L.collected, align: "end", cell: (row) => <Money amount={row.collected} /> },
  {
    id: "expected",
    header: L.expected,
    align: "end",
    cell: (row) => (row.expected === null ? <span className="text-muted-foreground">—</span> : <Money amount={row.expected} />),
  },
  {
    id: "gap",
    header: L.gap,
    align: "end",
    mobile: "aside",
    cell: (row) => (row.expected === null ? <span className="text-muted-foreground">—</span> : <Gap value={row.collected - row.expected} />),
  },
];

const PAYMENT_COLUMNS: readonly DataTableColumn<PlatformPayment>[] = [
  {
    id: "center",
    header: L.center,
    mobile: "title",
    cell: (row) => (
      <Link href={`${ROUTES.platform.centers}/${row.center_id}`} className="rounded-sm font-semibold text-heading hover:text-primary">
        {row.center_name}
      </Link>
    ),
  },
  { id: "paid", header: P.center.paidAt, cell: (row) => <span className="numeric">{formatDate(row.paid_at)}</span> },
  { id: "amount", header: P.center.amount, align: "end", mobile: "aside", cell: (row) => <Money amount={row.amount} className="font-semibold" /> },
  {
    id: "period",
    header: P.center.periodCovered,
    mobile: "wide",
    cell: (row) =>
      row.period_covered_start && row.period_covered_end ? (
        <span className="numeric">{P.center.periodRange(formatDate(row.period_covered_start), formatDate(row.period_covered_end))}</span>
      ) : (
        "—"
      ),
  },
  { id: "method", header: P.center.method, cell: (row) => P.paymentMethod[row.method] },
  { id: "reference", header: P.center.reference, mobile: "hidden", cell: (row) => row.reference ?? "—" },
];

export default async function PlatformBillingPage() {
  const { months, payments } = await getPlatformBilling();
  const current = months[0];
  const expected = current?.expected ?? 0;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={L.title} description={L.description} />

      {current ? (
        <StatTiles>
          <StatTile value={formatMAD(current.collected)} label={`${L.collected} · ${L.currentMonth}`} />
          <StatTile value={formatMAD(expected)} label={`${L.expected} · ${L.currentMonth}`} />
          <StatTile value={<Gap value={current.collected - expected} />} label={`${L.gap} · ${L.currentMonth}`} />
        </StatTiles>
      ) : null}

      <SectionCard title={L.monthsTitle} description={L.monthsDescription}>
        <DataTable columns={MONTH_COLUMNS} rows={months} getRowId={(row) => row.month} caption={L.monthsTitle} variant="plain" />
      </SectionCard>

      <SectionCard title={L.paymentsTitle}>
        {payments.length === 0 ? (
          <EmptyState icon={Wallet} title={L.empty} description={L.emptyDescription} />
        ) : (
          <DataTable columns={PAYMENT_COLUMNS} rows={payments} getRowId={(row) => row.payment_id} caption={L.paymentsTitle} variant="plain" />
        )}
      </SectionCard>
    </div>
  );
}
