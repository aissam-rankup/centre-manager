import { ChevronLeft, ChevronRight, ShieldAlert, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/components/shared/app-link";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/auth/routes";
import { requireModule, requireRole } from "@/lib/auth/session";
import { getPayroll, getTeacherPaySettings } from "@/lib/data/payroll";
import { toISODate, today } from "@/lib/format";
import { getLabels } from "@/lib/i18n/server";
import { compareMonths, monthKey, monthLabel, parsePayrollMonth, type PayrollMonth, shiftMonth } from "@/lib/payroll";

import { PayrollActions, PayrollBoard } from "./payroll-board";
import { TeacherPaySettingsSection } from "./teacher-pay-settings";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLabels()).payroll.title };
}

/** Paie des professeurs : un mois à la fois (jamais un mois à venir). */
export default async function PayrollPage({ searchParams }: PageProps<"/admin/paie">) {
  const LABELS = await getLabels();
  const P = LABELS.payroll;
  const profile = await requireRole("admin");
  requireModule(profile, "finance");

  if (profile.support) {
    return <EmptyState icon={ShieldAlert} title={P.title} description={P.supportUnavailable} />;
  }

  const now = today();
  const current: PayrollMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const requested = parsePayrollMonth((await searchParams).mois, current);
  const month = compareMonths(requested, current) > 0 ? current : requested;
  const isCurrent = compareMonths(month, current) === 0;

  const [payroll, teachers] = await Promise.all([getPayroll(month), getTeacherPaySettings()]);
  const href = (value: PayrollMonth) => `${ROUTES.admin.payroll}?mois=${monthKey(value)}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={P.title} description={P.description} showTitle />

      <nav aria-label={P.month} className="flex items-center justify-between gap-2 rounded-xl bg-card p-2 shadow-card sm:w-fit">
        <Button asChild variant="ghost" size="icon" aria-label={P.previousMonth}>
          <Link href={href(shiftMonth(month, -1))}>
            <ChevronLeft aria-hidden />
          </Link>
        </Button>
        <span className="min-w-40 text-center font-semibold">{monthLabel(month)}</span>
        {isCurrent ? (
          <Button variant="ghost" size="icon" disabled aria-label={P.nextMonth}>
            <ChevronRight aria-hidden />
          </Button>
        ) : (
          <Button asChild variant="ghost" size="icon" aria-label={P.nextMonth}>
            <Link href={href(shiftMonth(month, 1))}>
              <ChevronRight aria-hidden />
            </Link>
          </Button>
        )}
      </nav>

      {payroll === null || payroll.lines.length === 0 ? (
        <EmptyState icon={Users} title={P.emptyTitle} description={P.emptyDescription} />
      ) : (
        <>
          <PayrollActions payroll={payroll} />
          <PayrollBoard payroll={payroll} todayIso={toISODate(now)} />
        </>
      )}

      {teachers.length > 0 ? (
        <TeacherPaySettingsSection teachers={teachers} defaultFrom={`${monthKey(month)}-01`} />
      ) : null}
    </div>
  );
}
