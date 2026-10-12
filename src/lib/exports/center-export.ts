import { strToU8, zipSync, type Zippable } from "fflate";

import { toCsv } from "@/lib/csv";
import { buildXlsx, type XlsxCell, type XlsxSheet } from "@/lib/exports/xlsx";

/**
 * Archive d'export des données d'un centre : un classeur Excel (un onglet par
 * type de donnée), les mêmes tableaux en CSV (UTF-8 avec BOM, « ; ») et un
 * fichier LISEZMOI. Fonction pure : les données viennent de la base
 * (export_center_data, colonnes choisies une à une, sans mot de passe ni jeton).
 * Utilisable pour l'export demandé par la console comme, plus tard, par
 * l'administrateur du centre.
 */

export type ExportTable = { title: string; rows: Record<string, unknown>[] };
export type ExportData = Record<string, ExportTable>;

export type ExportMeta = {
  centerName: string;
  slug: string;
  /** « 2026-10-12 14:30 » (Casablanca). */
  generatedAt: string;
  periodFrom: string | null;
  periodTo: string | null;
  reason: string;
};

const EMPTY = "Aucune donnée";

function cellOf(value: unknown): XlsxCell {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return JSON.stringify(value);
}

/** Tableau d'un onglet : colonnes de la première ligne ; vide : une ligne « Aucune donnée ». */
export function toSheet(table: ExportTable): XlsxSheet {
  const columns = table.rows.length > 0 ? Object.keys(table.rows[0]) : [EMPTY];
  const rows = table.rows.map((row) => columns.map((column) => cellOf(row[column])));
  return { name: table.title, columns, rows };
}

/**
 * Cellule CSV : booléens en « Oui » / « Non » ; texte commençant par = + - @
 * précédé d'une apostrophe (jamais exécuté comme une formule à l'ouverture).
 */
export function csvCell(value: XlsxCell): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (typeof value === "number") return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** « Élèves et tuteurs » → « eleves-et-tuteurs » */
export function fileSlug(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "donnees"
  );
}

export function exportFileName(slug: string, generatedAt: string): string {
  return `dirassty-${fileSlug(slug)}-${generatedAt.slice(0, 10)}.zip`;
}

function readme(data: ExportData, meta: ExportMeta, csvNames: string[]): string {
  const tables = Object.values(data);
  const lines = [
    `Export des données — ${meta.centerName}`,
    `Adresse du centre : ${meta.slug}`,
    `Généré le : ${meta.generatedAt} (heure de Casablanca)`,
    `Période : ${meta.periodFrom && meta.periodTo ? `du ${meta.periodFrom} au ${meta.periodTo}` : "tout l'historique"}`,
    `Motif : ${meta.reason}`,
    "",
    "Contenu :",
    `  - ${exportWorkbookName(meta.slug)} : un onglet par type de donnée ;`,
    "  - dossier csv : les mêmes tableaux, un fichier par onglet (UTF-8 avec BOM, séparateur « ; », décimales avec une virgule).",
    "",
    ...tables.map((table, index) => `  ${csvNames[index]} : ${table.title} (${table.rows.length} ligne${table.rows.length > 1 ? "s" : ""})`),
    "",
    "La période s'applique aux données datées (paiements des élèves, reçus, présences, charges, paie, caisse).",
    "Les données de référence (élèves, tuteurs, inscriptions, matières, packs, équipe, emploi du temps, salles, remises) sont complètes.",
    "Aucun mot de passe, aucun jeton ni code de connexion n'est exporté.",
    "Montants en dirhams (MAD). Dates au format année-mois-jour dans les fichiers CSV.",
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function exportWorkbookName(slug: string): string {
  return `${fileSlug(slug)}-donnees.xlsx`;
}

/** Archive ZIP complète (octets). */
export function buildCenterExportArchive(data: ExportData, meta: ExportMeta): Uint8Array {
  const tables = Object.entries(data);
  const sheets = tables.map(([, table]) => toSheet(table));
  const csvNames = tables.map(([key], index) => `csv/${String(index + 1).padStart(2, "0")}-${fileSlug(key)}.csv`);
  const files: Zippable = {
    "LISEZMOI.txt": strToU8(readme(data, meta, csvNames)),
    [exportWorkbookName(meta.slug)]: [buildXlsx(sheets), { level: 0 }],
  };
  sheets.forEach((sheet, index) => {
    files[csvNames[index]] = strToU8(toCsv(sheet.columns, sheet.rows.map((row) => row.map(csvCell))));
  });
  return zipSync(files, { level: 6 });
}
