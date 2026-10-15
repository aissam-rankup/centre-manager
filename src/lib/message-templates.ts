/**
 * Modèles de messages aux familles dans chaque langue.
 *
 * Le modèle français reste dans ses colonnes d'origine (receipt_whatsapp_template…) ;
 * les modèles en arabe et en anglais sont dans centers.message_templates :
 * { "ar": { "receipt": "…", "absence": "…", "reminder_upcoming": "…", … }, "en": { … } }.
 * Comme en français, un modèle s'enregistre avec ses variables sous leur forme
 * d'origine (vocabulaire par défaut de sa langue) : il survit à un changement de
 * vocabulaire du centre. Vide : message proposé par l'application, dans la langue de la famille.
 */

import { z } from "zod";

import { type AppLabels, familyLabelsFor, labelsFor } from "@/lib/constants/labels";
import type { Locale } from "@/lib/i18n/locale";
import { DEFAULT_VOCABULARY } from "@/lib/vocabulary";

export const TEMPLATE_KINDS = ["receipt", "absence", "reminder_upcoming", "reminder_due_today", "reminder_overdue"] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

/** Langues dont les modèles sont dans centers.message_templates (le français a ses colonnes). */
export const TRANSLATED_LOCALES = ["ar", "en"] as const;
export type TranslatedLocale = (typeof TRANSLATED_LOCALES)[number];

export type TranslatedTemplates = Partial<Record<TranslatedLocale, Partial<Record<TemplateKind, string>>>>;

const kindTemplates = z.partialRecord(z.enum(TEMPLATE_KINDS), z.string());
const translatedSchema = z.partialRecord(z.enum(TRANSLATED_LOCALES), kindTemplates);

/** Modèles lus en base (forme enregistrée) ; une valeur inattendue est ignorée. */
export function parseTranslatedTemplates(value: unknown): TranslatedTemplates {
  const parsed = translatedSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

/** Copie avec un modèle remplacé (null : retiré, message proposé). */
export function withTranslatedTemplate(
  all: TranslatedTemplates,
  locale: TranslatedLocale,
  kind: TemplateKind,
  template: string | null,
): TranslatedTemplates {
  const forLocale = { ...all[locale] };
  if (template) forLocale[kind] = template;
  else delete forLocale[kind];
  const next: TranslatedTemplates = { ...all, [locale]: forLocale };
  if (Object.keys(forLocale).length === 0) delete next[locale];
  return next;
}

export const isTranslatedLocale = (locale: Locale): locale is TranslatedLocale => locale !== "fr";

/** Groupe de modèles : variables et messages proposés lus dans les libellés. */
export type TemplateGroup = "receipt" | "absence" | "reminder";

export type TemplateTokens = Record<string, string>;

/** Variables d'un groupe, dans des libellés donnés. */
export function groupTokens(group: TemplateGroup, labels: AppLabels): TemplateTokens {
  if (group === "receipt") return labels.receipts.tokens;
  if (group === "absence") return labels.absenceAlerts.tokens;
  return labels.reenrollment.reminders.tokens;
}

/** Variables sous leur forme d'origine pour une langue (vocabulaire par défaut de cette langue). */
export function canonicalTokens(group: TemplateGroup, locale: Locale): TemplateTokens {
  return groupTokens(group, locale === "fr" ? labelsFor() : familyLabelsFor(DEFAULT_VOCABULARY, null, locale));
}

/** Message proposé par l'application pour un modèle, dans des libellés donnés. */
export function defaultTemplate(kind: TemplateKind, labels: AppLabels): string {
  switch (kind) {
    case "receipt":
      return labels.receipts.whatsappTemplate;
    case "absence":
      return labels.absenceAlerts.template;
    case "reminder_upcoming":
      return labels.reenrollment.reminders.templates.upcoming;
    case "reminder_due_today":
      return labels.reenrollment.reminders.templates.due_today;
    case "reminder_overdue":
      return labels.reenrollment.reminders.templates.overdue;
  }
}

export function groupOf(kind: TemplateKind): TemplateGroup {
  return kind === "receipt" ? "receipt" : kind === "absence" ? "absence" : "reminder";
}
