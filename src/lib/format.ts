import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { arMA, enGB, fr } from "date-fns/locale";

import { LABELS } from "@/lib/constants/labels";
import { intlLocale, type Locale } from "@/lib/i18n/locale";

/** Fuseau horaire de référence de l'application. */
export const TIME_ZONE = "Africa/Casablanca";

/** Formateurs de montant d'une langue : sans centimes, avec centimes (toujours deux décimales, « 1 732,50 »). */
type AmountFormatters = { whole: Intl.NumberFormat; cents: Intl.NumberFormat };

/** Un jeu de formateurs de montant par locale Intl, créé à la première demande. */
const amountFormatters = new Map<string, AmountFormatters>();

function amountFormattersFor(intl: string): AmountFormatters {
  let formatters = amountFormatters.get(intl);
  if (!formatters) {
    formatters = {
      whole: new Intl.NumberFormat(intl, { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
      cents: new Intl.NumberFormat(intl, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    };
    amountFormatters.set(intl, formatters);
  }
  return formatters;
}

/** Nom de la devise en arabe, après le montant (« 1.200 درهم »). */
const ARABIC_CURRENCY = "درهم";

/** Un formateur de pourcentage par langue, créé à la première demande. */
const percentFormatters = new Map<Locale, Intl.NumberFormat>();

/**
 * « 1 200 MAD », « 1 732,50 MAD » (français et anglais) ; « 1.200 درهم », « 1.732,50 درهم » (arabe, chiffres occidentaux).
 * Les messages et documents destinés aux familles gardent la langue par défaut.
 */
export function formatMAD(amount: number, locale: Locale = "fr"): string {
  const rounded = Math.round(amount * 100) / 100;
  const arabic = locale === "ar";
  const { whole, cents } = amountFormattersFor(arabic ? intlLocale("ar") : "fr-FR");
  const formatter = Number.isInteger(rounded) ? whole : cents;
  // Espace insécable classique pour les milliers, pour un rendu « 1 200 MAD » homogène.
  const digits = formatter.format(rounded).replace(/ /g, " ");
  return `${digits} ${arabic ? ARABIC_CURRENCY : LABELS.currency.code}`;
}

/** « 12,5 % » ; « 12.5% » */
export function formatPercent(ratio: number, locale: Locale = "fr"): string {
  let formatter = percentFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(intlLocale(locale), { style: "percent", maximumFractionDigits: 1 });
    percentFormatters.set(locale, formatter);
  }
  return formatter.format(ratio);
}

/** Noms des jours et des mois dans la langue de l'interface (arabe : mois du Maroc, « يوليوز، غشت »). */
const DATE_LOCALES = { fr, en: enGB, ar: arMA } as const;

/** Locale date-fns d'une langue (formats personnalisés : `format(date, "MMM", { locale: dateLocale(locale) })`). */
export function dateLocale(locale: Locale) {
  return DATE_LOCALES[locale];
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Date au fuseau de Casablanca.
 * Une date seule (« 2026-09-23 », colonne Postgres `date`) est un jour calendaire :
 * elle est prise telle quelle, sans conversion de fuseau.
 */
export function inAppTimeZone(date: Date | string): TZDate {
  if (typeof date === "string") {
    const match = DATE_ONLY.exec(date);
    if (match) return new TZDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]), TIME_ZONE);
    return new TZDate(new Date(date), TIME_ZONE);
  }
  return new TZDate(date, TIME_ZONE);
}

/** Date du jour à Casablanca. */
export function today(): TZDate {
  return TZDate.tz(TIME_ZONE);
}

/** « 24/09/2026 » */
export function formatDate(date: Date | string): string {
  return format(inAppTimeZone(date), "dd/MM/yyyy", { locale: fr });
}

/** « 14:30 » */
export function formatTime(date: Date | string): string {
  return format(inAppTimeZone(date), "HH:mm", { locale: fr });
}

/** « 24/09/2026 14:30 » */
export function formatDateTime(date: Date | string): string {
  return format(inAppTimeZone(date), "dd/MM/yyyy HH:mm", { locale: fr });
}

/** « jeudi 24/09/2026 » ; « Thursday 24/09/2026 » */
export function formatDateWithWeekday(date: Date | string, locale: Locale = "fr"): string {
  return format(inAppTimeZone(date), "EEEE dd/MM/yyyy", { locale: DATE_LOCALES[locale] });
}

/** « 27 septembre 2026 » ; « 27 September 2026 » */
export function formatLongDate(date: Date | string, locale: Locale = "fr"): string {
  return format(inAppTimeZone(date), "d MMMM yyyy", { locale: DATE_LOCALES[locale] });
}

/** « 5 novembre », « 1er décembre » ; « 5 November », « 1 December » */
export function formatDayMonth(date: Date | string, locale: Locale = "fr"): string {
  const zoned = inAppTimeZone(date);
  const day = zoned.getDate();
  return `${day === 1 && locale === "fr" ? "1er" : day} ${format(zoned, "MMMM", { locale: DATE_LOCALES[locale] })}`;
}

/** « 2026-09-24 » — format des colonnes `date` Postgres, au fuseau de Casablanca. */
export function toISODate(date: Date | string): string {
  return format(inAppTimeZone(date), "yyyy-MM-dd");
}

/** « septembre 2026 » ; « September 2026 » */
export function formatMonth(date: Date | string, locale: Locale = "fr"): string {
  return format(inAppTimeZone(date), "MMMM yyyy", { locale: DATE_LOCALES[locale] });
}
