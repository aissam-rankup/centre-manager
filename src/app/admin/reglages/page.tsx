import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { requireRole } from "@/lib/auth/session";
import { getSessionBrand } from "@/lib/branding";
import { getAbsenceAlertsSettings } from "@/lib/data/absence-alerts";
import { getCenterFamilyLocale } from "@/lib/data/family-locale";
import { getTemplateLanguagePacks } from "@/lib/data/message-templates";
import { getEditableCenterSettings } from "@/lib/data/receipts";
import { getReenrollmentSettings } from "@/lib/data/reenrollment";
import { getReminderSettings } from "@/lib/data/reminders";
import { getCashSettings } from "@/lib/data/cash";
import { getLabels } from "@/lib/i18n/server";
import type { ModuleKey } from "@/lib/modules";

import { AbsenceSettingsForm } from "./absence-settings-form";
import { CashSettingsForm } from "./cash-settings-form";
import { FamilyLocaleForm } from "./family-locale-form";
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
  const has = (key: ModuleKey) => profile.modules.includes(key);
  // Réglages d'un module : affichés (et lus) seulement si le centre l'a.
  const [settings, brand, absenceSettings, reenrollment, reminders, cash, familyLocale] = await Promise.all([
    getEditableCenterSettings(),
    getSessionBrand(),
    has("absence_tracking") ? getAbsenceAlertsSettings() : null,
    has("reenrollment") ? getReenrollmentSettings() : null,
    has("reenrollment") ? getReminderSettings() : null,
    has("finance") ? getCashSettings() : null,
    getCenterFamilyLocale(),
  ]);
  const centerName = brand.whiteLabel ? brand.name : profile.centerName;
  // Éditeurs de modèles : variables, messages proposés et modèles du centre dans chaque langue.
  const [receiptPacks, absencePacks, reminderPacks] = await Promise.all([
    getTemplateLanguagePacks("receipt", ["receipt"], { receipt: settings.whatsappTemplate }),
    absenceSettings ? getTemplateLanguagePacks("absence", ["absence"], { absence: absenceSettings.template }) : [],
    reminders
      ? getTemplateLanguagePacks("reminder", ["reminder_upcoming", "reminder_due_today", "reminder_overdue"], {
          reminder_upcoming: reminders.templates.upcoming,
          reminder_due_today: reminders.templates.due_today,
          reminder_overdue: reminders.templates.overdue,
        })
      : [],
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={LABELS.centerSettings.title} description={LABELS.centerSettings.description} />
      <CenterSettingsForm settings={settings} centerName={centerName} packs={receiptPacks} />
      <FamilyLocaleForm locale={familyLocale} />
      {reenrollment ? <ReenrollmentSettingsForm settings={reenrollment} /> : null}
      {reminders ? <PaymentRemindersForm settings={reminders} centerName={centerName} packs={reminderPacks} /> : null}
      {cash ? <CashSettingsForm settings={cash} /> : null}
      {absenceSettings ? <AbsenceSettingsForm settings={absenceSettings} centerName={centerName} packs={absencePacks} /> : null}
    </div>
  );
}
