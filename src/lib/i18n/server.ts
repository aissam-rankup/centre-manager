import "server-only";

import { cache } from "react";

import { describeDatabaseError } from "@/lib/actions/result";
import { getAuthState } from "@/lib/auth/session";
import { getSessionBrand } from "@/lib/branding";
import { type AppLabels, labelsFor, messageTranslator } from "@/lib/constants/labels";
import { getAppLocale } from "@/lib/i18n/request-locale";
import { translateDbMessage } from "@/lib/i18n/translate-db-message";
import { DEFAULT_VOCABULARY, translator, type Translator, type VocabularyTerms } from "@/lib/vocabulary";
import { arabicTranslator } from "@/lib/vocabulary-ar";
import { englishTranslator } from "@/lib/vocabulary-en";

/** Vocabulaire du compte connecté (centre, ou centre consulté en support) ; défaut sinon. */
export const getVocabularyTerms = cache(async (): Promise<VocabularyTerms> => {
  const state = await getAuthState();
  if (state.status === "authenticated") return state.profile.vocabulary;
  return state.status === "student" ? state.student.vocabulary : DEFAULT_VOCABULARY;
});

/** Libellés de l'interface dans la langue de l'utilisateur et le vocabulaire du centre (Server Components, Server Actions). */
export const getLabels = cache(async (): Promise<AppLabels> => {
  const [brand, terms, locale] = await Promise.all([getSessionBrand(), getVocabularyTerms(), getAppLocale()]);
  return labelsFor(terms, brand.whiteLabel ? brand.name : null, locale);
});

/**
 * Libellés des documents remis aux familles (reçu imprimé ou partagé) : en français,
 * dans le vocabulaire et la marque du centre, quelle que soit la langue de l'utilisateur.
 */
export const getFamilyLabels = cache(async (): Promise<AppLabels> => {
  const [brand, terms] = await Promise.all([getSessionBrand(), getVocabularyTerms()]);
  return labelsFor(terms, brand.whiteLabel ? brand.name : null);
});

/** Message rédigé en français (validation, action) → langue de l'utilisateur. */
export const getMessageTranslator = cache(async (): Promise<(text: string) => string> => {
  const [brand, terms, locale] = await Promise.all([getSessionBrand(), getVocabularyTerms(), getAppLocale()]);
  return messageTranslator(terms, brand.whiteLabel ? brand.name : null, locale);
});

/** Résolution du vocabulaire pour un texte libre (ex. message d'erreur de la base). */
export const getTranslator = cache(async (): Promise<Translator> => translator(await getVocabularyTerms()));

/**
 * Message d'erreur de la base dans la langue de l'utilisateur et le vocabulaire du centre
 * (les fonctions SQL écrivent en français : « élève », « matière »…).
 */
export async function describeCenterError(error: { code?: string; message?: string; hint?: string | null }): Promise<string> {
  const text = describeDatabaseError(error);
  const locale = await getAppLocale();
  if (locale === "fr") return (await getTranslator())(text);
  const translated = translateDbMessage(text, locale);
  if (!translated) return (await getMessageTranslator())(text);
  const terms = await getVocabularyTerms();
  return (locale === "en" ? englishTranslator(terms) : arabicTranslator(terms))(translated);
}
