import "server-only";

import { cache } from "react";

import { requireStaff } from "@/lib/auth/session";
import { getSessionBrand } from "@/lib/branding";
import { type AppLabels, familyLabelsFor } from "@/lib/constants/labels";
import { getVocabularyTerms } from "@/lib/i18n/server";
import { type Locale, LOCALES } from "@/lib/i18n/locale";
import {
  canonicalTokens,
  defaultTemplate,
  groupTokens,
  parseTranslatedTemplates,
  type TemplateGroup,
  type TemplateKind,
  type TemplateTokens,
  type TranslatedLocale,
  type TranslatedTemplates,
  withTranslatedTemplate,
} from "@/lib/message-templates";
import { createClient } from "@/lib/supabase/server";
import { fromCanonicalTokens, TEMPLATE_MAX_LENGTH, toCanonicalTokens } from "@/lib/templates";

/** Modèles en arabe et en anglais du centre (forme enregistrée). */
export const getTranslatedTemplates = cache(async (): Promise<TranslatedTemplates> => {
  const profile = await requireStaff();
  const supabase = await createClient();
  const { data } = await supabase.from("centers").select("message_templates").eq("id", profile.centerId).maybeSingle();
  return parseTranslatedTemplates(data?.message_templates);
});

/** Modèle du centre pour une langue autre que le français (forme enregistrée) ; null : message proposé. */
export async function getTranslatedTemplate(locale: TranslatedLocale, kind: TemplateKind): Promise<string | null> {
  return (await getTranslatedTemplates())[locale]?.[kind] ?? null;
}

/** Libellés des messages aux familles d'une langue, dans le vocabulaire et la marque du centre. */
const familyLabels = cache(async (locale: Locale): Promise<AppLabels> => {
  const [terms, brand] = await Promise.all([getVocabularyTerms(), getSessionBrand()]);
  return familyLabelsFor(terms, brand.whiteLabel ? brand.name : null, locale);
});

/** Variables affichées (vocabulaire du centre) et d'origine d'un groupe, pour une langue. */
export async function templateTokens(group: TemplateGroup, locale: Locale): Promise<{ tokens: TemplateTokens; canonical: TemplateTokens }> {
  return { tokens: groupTokens(group, await familyLabels(locale)), canonical: canonicalTokens(group, locale) };
}

/** Ce qu'un éditeur de modèles affiche pour une langue. */
export type TemplateLanguagePack = {
  locale: Locale;
  /** Variables dans le vocabulaire du centre. */
  tokens: TemplateTokens;
  /** Variables sous leur forme d'origine (remplacées aussi à l'envoi). */
  canonical: TemplateTokens;
  /** Message proposé par l'application, par modèle. */
  defaults: Partial<Record<TemplateKind, string>>;
  /** Modèle du centre (forme affichée), par modèle ; absent : message proposé. */
  current: Partial<Record<TemplateKind, string>>;
  /** Valeurs d'exemple de l'aperçu. */
  sample: Record<string, string>;
};

function groupSample(group: TemplateGroup, labels: AppLabels): Record<string, string> {
  if (group === "receipt") return labels.centerSettings.sample;
  if (group === "absence") return labels.absenceAlerts.settings.sample;
  return labels.reenrollment.reminders.settings.sample;
}

/**
 * Données des éditeurs de modèles, pour chaque langue. Le français reprend les
 * modèles déjà lus par les réglages (`frenchCurrent`, forme affichée).
 */
export async function getTemplateLanguagePacks(
  group: TemplateGroup,
  kinds: readonly TemplateKind[],
  frenchCurrent: Partial<Record<TemplateKind, string | null>>,
): Promise<TemplateLanguagePack[]> {
  const translated = await getTranslatedTemplates();
  return Promise.all(
    LOCALES.map(async (locale) => {
      const labels = await familyLabels(locale);
      const { tokens, canonical } = await templateTokens(group, locale);
      const defaults: Partial<Record<TemplateKind, string>> = {};
      const current: Partial<Record<TemplateKind, string>> = {};
      for (const kind of kinds) {
        defaults[kind] = defaultTemplate(kind, labels);
        const stored = locale === "fr" ? frenchCurrent[kind] : translated[locale]?.[kind];
        if (stored) current[kind] = locale === "fr" ? stored : fromCanonicalTokens(stored, tokens, canonical);
      }
      return { locale, tokens, canonical, defaults, current, sample: groupSample(group, labels) };
    }),
  );
}

export type TranslatedTemplateInput = { locale: TranslatedLocale; kind: TemplateKind; value: string };

/**
 * Modèles en arabe et en anglais à enregistrer : variables sous leur forme d'origine,
 * message identique au message proposé (ou vide) retiré. Erreur : message à afficher.
 */
export async function prepareTranslatedTemplates(
  inputs: readonly TranslatedTemplateInput[],
): Promise<{ ok: true; templates: TranslatedTemplates } | { ok: false; error: string; locale: TranslatedLocale; kind: TemplateKind }> {
  let next = await getTranslatedTemplates();
  const C = (await familyLabels("fr")).centerSettings;
  for (const { locale, kind, value } of inputs) {
    const group = kind === "receipt" ? "receipt" : kind === "absence" ? "absence" : "reminder";
    const [labels, { tokens, canonical }] = await Promise.all([familyLabels(locale), templateTokens(group, locale)]);
    const text = value.trim();
    const stored = text && text !== defaultTemplate(kind, labels) ? toCanonicalTokens(text, tokens, canonical) : null;
    if (stored && stored.length > TEMPLATE_MAX_LENGTH) return { ok: false, error: C.templateTooLong, locale, kind };
    if (stored && kind === "receipt" && !stored.includes(canonical.link ?? "")) {
      return { ok: false, error: C.templateNeedsLink, locale, kind };
    }
    next = withTranslatedTemplate(next, locale, kind, stored);
  }
  return { ok: true, templates: next };
}
