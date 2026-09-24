import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

import { LABELS } from "@/lib/constants/labels";

const amountFormatter = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat("fr-FR", {
  style: "percent",
  maximumFractionDigits: 1,
});

/** 1 250 MAD — montant avec le code devise. */
export function formatMAD(amount: number): string {
  return `${amountFormatter.format(amount)} ${LABELS.currency.code}`;
}

/** 1 250 dirhams marocains — montant avec la devise en toutes lettres. */
export function formatMADLong(amount: number): string {
  const unit = Math.abs(amount) >= 2 ? LABELS.currency.namePlural : LABELS.currency.name;
  return `${amountFormatter.format(amount)} ${unit}`;
}

/** 12,5 % */
export function formatPercent(ratio: number): string {
  return percentFormatter.format(ratio);
}

/** 24/09/2026 */
export function formatDateShort(date: Date | string): string {
  return format(toDate(date), "dd/MM/yyyy", { locale: fr });
}

/** 24 septembre 2026 */
export function formatDateLong(date: Date | string): string {
  return format(toDate(date), "d MMMM yyyy", { locale: fr });
}

/** jeudi 24 septembre 2026 */
export function formatDateWithWeekday(date: Date | string): string {
  return format(toDate(date), "EEEE d MMMM yyyy", { locale: fr });
}

/** il y a 3 jours */
export function formatRelative(date: Date | string): string {
  return formatDistanceToNow(toDate(date), { locale: fr, addSuffix: true });
}

function toDate(date: Date | string): Date {
  return typeof date === "string" ? new Date(date) : date;
}
