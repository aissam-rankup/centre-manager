import type { Metadata } from "next";

import { CashView } from "@/components/cash/cash-view";
import { ROUTES } from "@/lib/auth/routes";
import { getCashPage } from "@/lib/data/cash";
import { getLabels } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLabels()).nav.cash };
}

/** Caisse du jour : encaissements, mouvements, comptage et clôture. */
export default async function AssistantCashPage() {
  const page = await getCashPage();
  return <CashView page={page} fileBase={ROUTES.assistant.students} />;
}
