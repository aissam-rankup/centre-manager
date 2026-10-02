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

/** Campagnes de réinscription : revue, intentions, confirmation par l'admin. */
export default async function AdminReenrollmentPage({ searchParams }: PageProps<"/admin/reinscriptions">) {
  const { campagne } = await searchParams;
  const page = await getCampaignPage(typeof campagne === "string" ? campagne : undefined);
  return (
    <CampaignView
      page={page}
      todayIso={toISODate(today())}
      basePath={ROUTES.admin.reenrollment}
      fileBase={ROUTES.admin.students}
      settingsHref={ROUTES.admin.settings}
    />
  );
}
