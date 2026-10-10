import type { Locale } from "@/lib/i18n/locale";

/**
 * CSV compatible Excel : séparateur « ; » dans toutes les langues (mêmes colonnes),
 * UTF-8 avec BOM (accents et arabe correctement affichés à l'ouverture).
 * Décimales : virgule en français et en arabe (« 1732,5 »), point en anglais (« 1732.5 »).
 */
type Cell = string | number | null | undefined;

const french = new Intl.NumberFormat("fr-FR", { useGrouping: false, maximumFractionDigits: 4 });
const DECIMALS: Record<Locale, Intl.NumberFormat> = {
  fr: french,
  en: new Intl.NumberFormat("en-GB", { useGrouping: false, maximumFractionDigits: 4 }),
  ar: french,
};

function escapeCell(cell: Cell, decimal: Intl.NumberFormat): string {
  if (cell === null || cell === undefined) return "";
  const text = typeof cell === "number" ? decimal.format(cell) : cell;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: readonly string[], rows: readonly (readonly Cell[])[], locale: Locale = "fr"): string {
  const decimal = DECIMALS[locale];
  const lines = [header, ...rows].map((row) => row.map((cell) => escapeCell(cell, decimal)).join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}
