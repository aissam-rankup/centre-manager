import type { Metadata } from "next";

import { CashHistory, parseMonthParam } from "@/components/cash/cash-history";
import { CashView } from "@/components/cash/cash-view";
import { ROUTES } from "@/lib/auth/routes";
import { getCashHistory, getCashPage } from "@/lib/data/cash";
import { toISODate, today } from "@/lib/format";
import { getLabels } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLabels()).nav.cash };
}

/** Caisse de l'admin : sa caisse du jour, puis l'historique des sessions et les écarts du mois. */
export default async function AdminCashPage({ searchParams }: PageProps<"/admin/caisse">) {
  const { mois } = await searchParams;
  const todayIso = toISODate(today());
  const month = parseMonthParam(typeof mois === "string" ? mois : undefined, todayIso);
  const [LABELS, page] = await Promise.all([getLabels(), getCashPage()]);
  const history = page.support ? null : await getCashHistory(month);

  return (
    <div className="flex flex-col gap-6">
      <CashView page={page} fileBase={ROUTES.admin.students} />
      {history ? <CashHistory rows={history.rows} overview={history.overview} month={month} todayIso={todayIso} LABELS={LABELS} /> : null}
    </div>
  );
}
