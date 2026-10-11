import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";

import { Font } from "@react-pdf/renderer";

import { formatMAD } from "@/lib/format";
import type { Locale } from "@/lib/i18n/locale";

/** Famille de police d'un style PDF : une police, ou une pile de repli (glyphe absent → police suivante). */
export type PdfFontFamily = string | string[];

/**
 * Typographie et sens de lecture d'un document PDF.
 * Les styles « miroir » (`row`, `end`, `alignEnd`) se substituent à « row », « right » et
 * « flex-end » : identiques en français et en anglais, inversés en arabe.
 */
export type PdfTypeface = {
  regular: PdfFontFamily;
  bold: PdfFontFamily;
  rtl: boolean;
  /** Rangée dans le sens de lecture : premier élément à gauche, ou à droite en arabe. */
  row: "row" | "row-reverse";
  /** Alignement du texte en début de ligne. */
  start: "left" | "right";
  /** Alignement du texte en fin de ligne (montants). */
  end: "left" | "right";
  /** Bloc calé en fin de ligne (totaux, signature). */
  alignEnd: "flex-start" | "flex-end";
};

const LATIN: PdfTypeface = {
  regular: "Helvetica",
  bold: "Helvetica-Bold",
  rtl: false,
  row: "row",
  start: "left",
  end: "right",
  alignEnd: "flex-end",
};

/**
 * IBM Plex Sans Arabic (OFL, @fontsource) : le sous-ensemble arabe n'a ni chiffres ni ponctuation latine,
 * le sous-ensemble latin les apporte (noms, montants, « dirassty »). Deux familles par graisse,
 * comme Helvetica / Helvetica-Bold.
 */
const ARABIC_FAMILIES = {
  regular: ["IBM Plex Sans Arabic", "IBM Plex Sans Arabic Latin"],
  bold: ["IBM Plex Sans Arabic Bold", "IBM Plex Sans Arabic Latin Bold"],
} as const;

const ARABIC: PdfTypeface = {
  regular: [...ARABIC_FAMILIES.regular],
  bold: [...ARABIC_FAMILIES.bold],
  rtl: true,
  row: "row-reverse",
  start: "right",
  end: "left",
  alignEnd: "flex-start",
};

const align4 = (size: number) => (size + 3) & ~3;

/**
 * Renomme la police (nom PostScript, nameID 6) en place, à longueur égale. Les sous-ensembles arabe et
 * latin portent le même nom : le moteur PDF, qui met les polices en cache par ce nom, réembarquerait
 * sinon une copie de la seconde à chaque bloc de texte.
 */
function renamePostScript(name: Buffer, from: string, to: string): void {
  const count = name.readUInt16BE(2);
  const storage = name.readUInt16BE(4);
  for (let index = 0; index < count; index += 1) {
    const record = 6 + index * 12;
    if (name.readUInt16BE(record + 6) !== 6) continue;
    const utf16 = name.readUInt16BE(record) !== 1; // Unicode et Windows : UTF-16BE ; Macintosh : un octet par caractère.
    const start = storage + name.readUInt16BE(record + 10);
    const bytes = name.subarray(start, start + name.readUInt16BE(record + 8));
    const value = utf16 ? Buffer.from(bytes).swap16().toString("utf16le") : bytes.toString("latin1");
    const renamed = value.replace(from, to);
    const encoded = utf16 ? Buffer.from(renamed, "utf16le").swap16() : Buffer.from(renamed, "latin1");
    if (encoded.length === bytes.length) encoded.copy(bytes);
  }
}

/**
 * WOFF → TrueType, en mémoire (tables décompressées, même ordre). fontkit lit mal le dernier glyphe
 * d'une police WOFF (lecture au-delà de la table glyf décompressée : l'espace insécable, ici) et ne sait
 * pas sous-ensembler une police WOFF2 ; la police TrueType ne pose aucun de ces problèmes.
 */
function woffToTrueType(woff: Buffer, rename?: { from: string; to: string }): Buffer {
  if (woff.readUInt32BE(0) !== 0x774f4646) throw new Error("Police WOFF attendue");
  const numTables = woff.readUInt16BE(12);
  const tables = Array.from({ length: numTables }, (_, index) => {
    const entry = 44 + index * 20;
    const offset = woff.readUInt32BE(entry + 4);
    const compLength = woff.readUInt32BE(entry + 8);
    const origLength = woff.readUInt32BE(entry + 12);
    const raw = woff.subarray(offset, offset + compLength);
    const tag = woff.readUInt32BE(entry);
    const data = compLength < origLength ? inflateSync(raw) : Buffer.from(raw);
    if (rename && tag === 0x6e616d65) renamePostScript(data, rename.from, rename.to); // « name »
    return { tag, checksum: woff.readUInt32BE(entry + 16), data };
  });
  const headerSize = 12 + 16 * numTables;
  const font = Buffer.alloc(tables.reduce((size, table) => size + align4(table.data.length), headerSize));
  const entrySelector = Math.floor(Math.log2(numTables));
  const searchRange = 2 ** entrySelector * 16;
  font.writeUInt32BE(woff.readUInt32BE(4), 0);
  font.writeUInt16BE(numTables, 4);
  font.writeUInt16BE(searchRange, 6);
  font.writeUInt16BE(entrySelector, 8);
  font.writeUInt16BE(numTables * 16 - searchRange, 10);
  let offset = headerSize;
  tables.forEach((table, index) => {
    const record = 12 + index * 16;
    font.writeUInt32BE(table.tag, record);
    font.writeUInt32BE(table.checksum, record + 4);
    font.writeUInt32BE(offset, record + 8);
    font.writeUInt32BE(table.data.length, record + 12);
    table.data.copy(font, offset);
    offset += align4(table.data.length);
  });
  return font;
}

/** Glyphe fontkit : ses caractères alimentent la table ToUnicode du PDF (copier-coller, recherche). */
type GlyphWithCodePoints = { codePoints: number[] };
type GlyphProvider = { getGlyph: (id: number, codePoints?: number[]) => GlyphWithCodePoints };

/**
 * fontkit met chaque glyphe en cache à sa première lecture. Une forme contextuelle (ح médian) lue d'abord
 * comme composant d'un autre glyphe (خ médian = ح + point) y entre sans caractère : le PDF l'afficherait
 * bien, mais le texte copié ou recherché la perdrait (« الم سوب »). On complète le glyphe à sa réutilisation.
 */
function keepCodePoints(font: GlyphProvider): void {
  const getGlyph = font.getGlyph.bind(font);
  font.getGlyph = (id, codePoints = []) => {
    const glyph = getGlyph(id, codePoints);
    if (glyph.codePoints.length === 0 && codePoints.length > 0) glyph.codePoints = codePoints;
    return glyph;
  };
}

let arabicRegistered = false;

/** Enregistre la police arabe (une seule fois, à la première demande) depuis node_modules. */
function registerArabicFonts(): void {
  if (arabicRegistered) return;
  const register = (family: string, subset: "arabic" | "latin", weight: 400 | 700) => {
    const file = path.join(process.cwd(), "node_modules", "@fontsource", "ibm-plex-sans-arabic", "files", `ibm-plex-sans-arabic-${subset}-${weight}-normal.woff`);
    const rename = subset === "latin" ? { from: "Arabic-", to: "ArLatn-" } : undefined;
    Font.register({ family, src: `data:font/ttf;base64,${woffToTrueType(readFileSync(file), rename).toString("base64")}` });
    const source = Font.getFont({ fontFamily: family });
    const load = source.load.bind(source);
    let patched = false;
    source.load = async () => {
      await load();
      if (!patched && source.data) {
        keepCodePoints(source.data as unknown as GlyphProvider);
        patched = true;
      }
    };
  };
  register(ARABIC_FAMILIES.regular[0], "arabic", 400);
  register(ARABIC_FAMILIES.regular[1], "latin", 400);
  register(ARABIC_FAMILIES.bold[0], "arabic", 700);
  register(ARABIC_FAMILIES.bold[1], "latin", 700);
  arabicRegistered = true;
}

/** Polices et sens de lecture d'un document dans une langue : Helvetica en français et en anglais, IBM Plex Sans Arabic en arabe. */
export function pdfTypeface(locale: Locale): PdfTypeface {
  if (locale !== "ar") return LATIN;
  registerArabicFonts();
  return ARABIC;
}

/**
 * Texte destiné au PDF : sans marques de direction invisibles (Intl en ajoute devant les nombres
 * arabes négatifs) ni signe moins typographique, absents des polices embarquées.
 */
export function pdfText(text: string): string {
  return text.replace(/[\u200e\u200f\u061c]/g, "").replace(/−/g, "-");
}

/**
 * Montant d'un document PDF ; `signed` : signe explicite (« + 200 MAD », « - 200 MAD »).
 * En arabe, le signe suit le nombre (« 1.200- درهم ») : de droite à gauche, il s'affiche alors collé
 * devant le nombre (« درهم -1.200 »), comme dans l'application, au lieu d'être rejeté après lui.
 */
export function pdfAmount(amount: number, locale: Locale, signed = false): string {
  if (amount === 0 || (!signed && amount > 0)) return pdfText(formatMAD(amount, locale));
  const sign = amount > 0 ? "+" : "-";
  const absolute = pdfText(formatMAD(Math.abs(amount), locale));
  if (locale === "ar") return absolute.replace(/^[\d.,]+/, (digits) => `${digits}${sign}`);
  return signed ? `${sign} ${absolute}` : `${sign}${absolute}`;
}
