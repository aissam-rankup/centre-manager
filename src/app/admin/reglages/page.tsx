import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { requireRole } from "@/lib/auth/session";
import { getSessionBrand } from "@/lib/branding";
import { getAbsenceAlertsSettings } from "@/lib/data/absence-alerts";
import { getEditableCenterSettings } from "@/lib/data/receipts";
import { getReenrollmentSettings } from "@/lib/data/reenrollment";
import { getReminderSettings } from "@/lib/data/reminders";
import { getLabels } from "@/lib/i18n/server";

import { AbsenceSettingsForm } from "./absence-settings-form";
import { PaymentRemindersForm } from "./payment-reminders-form";
import { ReenrollmentSettingsForm } from "./reenrollment-settings-form";
import { CenterSettingsForm } from "./settings-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLabels()).centerSettings.title };
}

/** Réglages du centre : coordonnées, format et message des reçus. */
export default async function CenterSettingsPage() {
  const LABELS = await getLabels();
  const profile = await requireRole("admin");
  const [settings, brand, absenceSettings, reenrollment, reminders] = await Promise.all([
    getEditableCenterSettings(),
    getSessionBrand(),
    getAbsenceAlertsSettings(),
    getReenrollmentSettings(),
    getReminderSettings(),
  ]);
  const centerName = brand.whiteLabel ? brand.name : profile.centerName;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={LABELS.centerSettings.title} description={LABELS.centerSettings.description} />
      <CenterSettingsForm settings={settings} centerName={centerName} />
      <ReenrollmentSettingsForm settings={reenrollment} />
      <PaymentRemindersForm settings={reminders} centerName={centerName} />
      <AbsenceSettingsForm settings={absenceSettings} centerName={centerName} />
    </div>
  );
}
