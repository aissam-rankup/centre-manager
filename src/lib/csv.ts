/**
 * CSV compatible Excel en français : séparateur « ; », virgule décimale,
 * UTF-8 avec BOM (accents correctement affichés à l'ouverture).
 */
type Cell = string | number | null | undefined;

const decimal = new Intl.NumberFormat("fr-FR", { useGrouping: false, maximumFractionDigits: 4 });

function escapeCell(cell: Cell): string {
  if (cell === null || cell === undefined) return "";
  const text = typeof cell === "number" ? decimal.format(cell) : cell;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: readonly string[], rows: readonly (readonly Cell[])[]): string {
  const lines = [header, ...rows].map((row) => row.map(escapeCell).join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}
