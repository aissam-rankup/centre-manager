import "server-only";

import { cache } from "react";

import { requireStaff } from "@/lib/auth/session";
import { getSessionBrand } from "@/lib/branding";
import { type AppLabels, familyLabelsFor } from "@/lib/constants/labels";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/locale";
import { getVocabularyTerms } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

/** Langue des familles du centre (réglages) ; français par défaut. */
export const getCenterFamilyLocale = cache(async (): Promise<Locale> => {
  const profile = await requireStaff();
  const supabase = await createClient();
  const { data } = await supabase.from("centers").select("family_locale").eq("id", profile.centerId).maybeSingle();
  return isLocale(data?.family_locale) ? data.family_locale : DEFAULT_LOCALE;
});

/** Langue propre d'une famille (fiche de l'élève) ; null : langue du centre. */
export const getStudentMessageLocale = cache(async (studentId: string): Promise<Locale | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("students").select("message_locale").eq("id", studentId).maybeSingle();
  return isLocale(data?.message_locale) ? data.message_locale : null;
});

/** Langue d'une famille : celle de l'élève, sinon celle du centre. */
export const getFamilyLocale = cache(async (studentId: string | null): Promise<Locale> => {
  const own = studentId ? await getStudentMessageLocale(studentId) : null;
  return own ?? getCenterFamilyLocale();
});

export type FamilyContext = { locale: Locale; labels: AppLabels };

/** Langue et libellés (modèles de messages compris) d'un message ou document remis à une famille. */
export async function getFamilyContext(studentId: string | null): Promise<FamilyContext> {
  const [locale, terms, brand] = await Promise.all([getFamilyLocale(studentId), getVocabularyTerms(), getSessionBrand()]);
  return { locale, labels: familyLabelsFor(terms, brand.whiteLabel ? brand.name : null, locale) };
}
