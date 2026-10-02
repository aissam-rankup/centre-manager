import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { requireRole } from "@/lib/auth/session";
import { getSessionBrand } from "@/lib/branding";
import { getEditableCenterSettings } from "@/lib/data/receipts";
import { getLabels } from "@/lib/i18n/server";

import { CenterSettingsForm } from "./settings-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLabels()).centerSettings.title };
}

/** Réglages du centre : coordonnées, format et message des reçus. */
export default async function CenterSettingsPage() {
  const LABELS = await getLabels();
  const profile = await requireRole("admin");
  const [settings, brand] = await Promise.all([getEditableCenterSettings(), getSessionBrand()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={LABELS.centerSettings.title} description={LABELS.centerSettings.description} />
      <CenterSettingsForm settings={settings} centerName={brand.whiteLabel ? brand.name : profile.centerName} />
    </div>
  );
}
