import { ArrowLeft, FileText, ReceiptText, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import { z } from "zod";

import Link from "@/components/shared/app-link";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { ROUTES } from "@/lib/auth/routes";
import { requireModule, requireRole } from "@/lib/auth/session";
import { listSalaryReceipts } from "@/lib/data/salary-receipts";
import { formatDate, formatMAD } from "@/lib/format";
import { getAppLocale } from "@/lib/i18n/request-locale";
import { getLabels } from "@/lib/i18n/server";
import { monthKey, type PayrollMonth } from "@/lib/payroll";
import { salaryPeriodLabel, type SalaryReceiptView } from "@/lib/salary-receipts";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLabels()).salaryReceipts.listTitle };
}

const PERIOD = /^(\d{4})-(\d{2})$/;

function parsePeriod(value: string | string[] | undefined): PayrollMonth | null {
  const match = typeof value === "string" ? PERIOD.exec(value) : null;
  if (!match) return null;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { year: Number(match[1]), month } : null;
}

const STATUS_TONE = {
  valid: "bg-success/15 text-success-ink",
  cancelled: "bg-danger/10 text-danger-ink",
  cancellation: "bg-muted text-muted-foreground",
} as const;

/** Historique des reçus de paie : filtres membre et période (formulaire GET, sans JavaScript). */
export default async function SalaryReceiptsPage({ searchParams }: PageProps<"/admin/paie/recus">) {
  const LABELS = await getLabels();
  const L = LABELS.salaryReceipts;
  const F = L.filters;
  const C = L.columns;
  const profile = await requireRole("admin");
  requireModule(profile, "finance");
  if (profile.support) return <EmptyState icon={ShieldAlert} title={L.listTitle} description={LABELS.payroll.supportUnavailable} />;

  const query = await searchParams;
  const memberId = typeof query.membre === "string" && z.uuid().safeParse(query.membre).success ? query.membre : null;
  const period = parsePeriod(query.periode);
  const [{ receipts, members, periods }, locale] = await Promise.all([listSalaryReceipts({ memberId, period }), getAppLocale()]);
  const filtered = memberId !== null || period !== null;

  const statusOf = (receipt: SalaryReceiptView) =>
    receipt.kind === "cancellation" ? "cancellation" : receipt.cancelledBy ? "cancelled" : "valid";

  const columns: DataTableColumn<SalaryReceiptView>[] = [
    {
      id: "number",
      header: C.number,
      mobile: "title",
      cell: (receipt) => (
        <Link href={ROUTES.salaryReceipt(receipt.id)} className="font-semibold text-primary tabular-nums hover:underline">
          {receipt.number}
        </Link>
      ),
    },
    { id: "issuedAt", header: C.issuedAt, cell: (receipt) => formatDate(receipt.issuedAt) },
    {
      id: "member",
      header: C.member,
      cell: (receipt) => (
        <span className="flex flex-col">
          <span className="font-medium">{receipt.memberName}</span>
          <span className="text-caption text-muted-foreground">{LABELS.roles[receipt.memberRole]}</span>
        </span>
      ),
    },
    { id: "period", header: C.period, cell: (receipt) => salaryPeriodLabel(receipt.period, locale) },
    {
      id: "amount",
      header: C.amount,
      align: "end",
      mobile: "aside",
      cell: (receipt) => (
        <span className={cn("numeric font-semibold", receipt.amount < 0 && "text-danger-ink")}>{formatMAD(receipt.amount, locale)}</span>
      ),
    },
    { id: "method", header: C.method, cell: (receipt) => LABELS.paymentMethods[receipt.method] },
    {
      id: "status",
      header: C.status,
      cell: (receipt) => {
        const status = statusOf(receipt);
        return <span className={cn("rounded-full px-2.5 py-0.5 text-caption font-semibold", STATUS_TONE[status])}>{L.status[status]}</span>;
      },
    },
    {
      id: "open",
      header: L.view,
      mobile: "hidden",
      align: "end",
      cell: (receipt) => (
        <Button asChild variant="ghost" size="icon" aria-label={`${L.view} — ${receipt.number}`}>
          <Link href={ROUTES.salaryReceipt(receipt.id)}>
            <FileText aria-hidden />
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={L.listTitle}
        description={L.listDescription}
        showTitle
        actions={
          <Button asChild variant="outline">
            <Link href={ROUTES.admin.payroll}>
              <ArrowLeft aria-hidden />
              {LABELS.payroll.title}
            </Link>
          </Button>
        }
      />

      <form method="get" className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-card sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1.5 sm:w-64">
          <span className="text-table font-medium">{F.member}</span>
          <NativeSelect name="membre" defaultValue={memberId ?? ""}>
            <option value="">{F.allMembers}</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1.5 sm:w-56">
          <span className="text-table font-medium">{F.period}</span>
          <NativeSelect name="periode" defaultValue={period ? monthKey(period) : ""}>
            <option value="">{F.allPeriods}</option>
            {periods.map((value) => (
              <option key={monthKey(value)} value={monthKey(value)}>
                {salaryPeriodLabel(value, locale)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <div className="flex gap-2">
          <Button type="submit">{F.apply}</Button>
          {filtered ? (
            <Button asChild variant="ghost">
              <Link href={ROUTES.admin.salaryReceipts}>{F.reset}</Link>
            </Button>
          ) : null}
        </div>
        <p className="text-caption text-muted-foreground sm:ms-auto">{L.count(receipts.length)}</p>
      </form>

      {receipts.length === 0 ? (
        <EmptyState icon={ReceiptText} title={L.emptyTitle} description={filtered ? L.emptyFiltered : L.emptyDescription} />
      ) : (
        <DataTable columns={columns} rows={receipts} getRowId={(receipt) => receipt.id} caption={L.listTitle} />
      )}
    </div>
  );
}
