import "server-only";

import { requireStaff } from "@/lib/auth/session";
import { getSessionBrand } from "@/lib/branding";
import { type AppLabels, labelsFor } from "@/lib/constants/labels";
import { getCenterReceiptSettings } from "@/lib/data/receipts";
import type { Locale } from "@/lib/i18n/locale";
import { getAppLocale } from "@/lib/i18n/request-locale";
import { getLabels, getVocabularyTerms } from "@/lib/i18n/server";
import { formatPhone } from "@/lib/phone";

export type CenterPdfBrand = { name: string; contact: string | null; logoUrl: string | null; color: string; whiteLabel: boolean };

/**
 * En-tête des documents du centre : sa marque en marque blanche, sinon son nom ; jamais la plateforme.
 * Coordonnées dans la langue des libellés fournis (à défaut, celle de l'utilisateur).
 */
export async function getCenterPdfBrand(labels?: AppLabels): Promise<CenterPdfBrand> {
  const profile = await requireStaff();
  const [brand, settings, LABELS] = await Promise.all([getSessionBrand(), getCenterReceiptSettings(), labels ?? getLabels()]);
  const contact = [settings.address, settings.phone ? LABELS.receipts.phone(formatPhone(settings.phone)) : null].filter(Boolean).join(" · ");
  return {
    name: brand.whiteLabel ? brand.name : profile.centerName,
    contact: contact || null,
    logoUrl: brand.logoUrl,
    color: brand.colors.primary ?? "#6c2bf5",
    whiteLabel: brand.whiteLabel,
  };
}

/**
 * Langue des documents PDF remis au personnel (paie, caisse) : celle de l'utilisateur.
 * L'arabe reste en français : les polices PDF standard n'ont pas de glyphes arabes
 * et aucune police arabe n'est embarquée.
 */
export function staffPdfLocale(locale: Locale): Locale {
  return locale === "ar" ? "fr" : locale;
}

export type StaffPdfContext = { locale: Locale; labels: AppLabels; brand: CenterPdfBrand };

/** Langue, libellés (vocabulaire et marque du centre) et en-tête d'un document PDF du personnel. */
export async function getStaffPdfContext(): Promise<StaffPdfContext> {
  const userLocale = await getAppLocale();
  const locale = staffPdfLocale(userLocale);
  const labels =
    locale === userLocale
      ? await getLabels()
      : await Promise.all([getSessionBrand(), getVocabularyTerms()]).then(([brand, terms]) =>
          labelsFor(terms, brand.whiteLabel ? brand.name : null, locale),
        );
  return { locale, labels, brand: await getCenterPdfBrand(labels) };
}
