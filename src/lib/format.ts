import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

import { LABELS } from "@/lib/constants/labels";

/** Fuseau horaire de référence de l'application. */
export const TIME_ZONE = "Africa/Casablanca";

const amountFormatter = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat("fr-FR", {
  style: "percent",
  maximumFractionDigits: 1,
});

/** « 1 200 MAD » */
export function formatMAD(amount: number): string {
  // Espace insécable classique pour les milliers, pour un rendu « 1 200 MAD » homogène.
  const digits = amountFormatter.format(amount).replace(/ /g, " ");
  return `${digits} ${LABELS.currency.code}`;
}

/** « 12,5 % » */
export function formatPercent(ratio: number): string {
  return percentFormatter.format(ratio);
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

/** « 24/09/2026 14:30 » */
export function formatDateTime(date: Date | string): string {
  return format(inAppTimeZone(date), "dd/MM/yyyy HH:mm", { locale: fr });
}

/** « jeudi 24/09/2026 » */
export function formatDateWithWeekday(date: Date | string): string {
  return format(inAppTimeZone(date), "EEEE dd/MM/yyyy", { locale: fr });
}

/** « 2026-09-24 » — format des colonnes `date` Postgres, au fuseau de Casablanca. */
export function toISODate(date: Date | string): string {
  return format(inAppTimeZone(date), "yyyy-MM-dd");
}

/** « septembre 2026 » */
export function formatMonth(date: Date | string): string {
  return format(inAppTimeZone(date), "MMMM yyyy", { locale: fr });
}
