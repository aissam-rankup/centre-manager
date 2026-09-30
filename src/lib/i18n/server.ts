import "server-only";

import { cache } from "react";

import { describeDatabaseError } from "@/lib/actions/result";
import { getAuthState } from "@/lib/auth/session";
import { getSessionBrand } from "@/lib/branding";
import { type AppLabels, labelsFor } from "@/lib/constants/labels";
import { DEFAULT_VOCABULARY, translator, type Translator, type VocabularyTerms } from "@/lib/vocabulary";

/** Vocabulaire du compte connecté (centre, ou centre consulté en support) ; défaut sinon. */
export const getVocabularyTerms = cache(async (): Promise<VocabularyTerms> => {
  const state = await getAuthState();
  return state.status === "authenticated" ? state.profile.vocabulary : DEFAULT_VOCABULARY;
});

/** Libellés de l'interface dans le vocabulaire du centre (Server Components, Server Actions). */
export const getLabels = cache(async (): Promise<AppLabels> => {
  const brand = await getSessionBrand();
  return labelsFor(await getVocabularyTerms(), brand.whiteLabel ? brand.name : null);
});

/** Résolution du vocabulaire pour un texte libre (ex. message d'erreur de la base). */
export const getTranslator = cache(async (): Promise<Translator> => translator(await getVocabularyTerms()));

/** Message d'erreur de la base, dans le vocabulaire du centre (les fonctions SQL écrivent « élève », « matière »…). */
export async function describeCenterError(error: { code?: string; message?: string }): Promise<string> {
  return (await getTranslator())(describeDatabaseError(error));
}
