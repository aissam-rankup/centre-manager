import type { Metadata } from "next";

import { CampaignView } from "@/components/reenrollment/campaign-view";
import { ROUTES } from "@/lib/auth/routes";
import { getCampaignPage } from "@/lib/data/reenrollment";
import { toISODate, today } from "@/lib/format";
import { getLabels } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const LABELS = await getLabels();
  return { title: LABELS.nav.reenrollment };
}

/** Campagnes de réinscription : l'accueil note les intentions, l'admin confirme. */
export default async function AssistantReenrollmentPage({ searchParams }: PageProps<"/assistant/reinscriptions">) {
  const { campagne } = await searchParams;
  const page = await getCampaignPage(typeof campagne === "string" ? campagne : undefined);
  return (
    <CampaignView
      page={page}
      todayIso={toISODate(today())}
      basePath={ROUTES.assistant.reenrollment}
      fileBase={ROUTES.assistant.students}
      settingsHref={null}
    />
  );
}
