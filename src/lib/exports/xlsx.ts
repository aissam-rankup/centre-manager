import { strToU8, zipSync, type Zippable } from "fflate";

/**
 * Classeur Excel (.xlsx, SpreadsheetML) minimal, sans dépendance lourde :
 * un onglet par tableau, ligne d'en-tête en gras, figée et filtrable,
 * largeurs de colonnes ajustées.
 *  - nombre : cellule numérique (montants au format « 1 234,50 » si la colonne contient « MAD ») ;
 *  - « 2026-10-12 » : date Excel ; « 2026-10-12 14:30 » : date et heure ;
 *  - booléen : « Oui » / « Non » ;
 *  - texte : chaîne en ligne (jamais interprétée comme une formule).
 */

export type XlsxCell = string | number | boolean | null | undefined;
export type XlsxSheet = { name: string; columns: readonly string[]; rows: readonly (readonly XlsxCell[])[] };

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;
// Caractères interdits en XML 1.0.
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

const STYLE = { header: 1, date: 2, dateTime: 3, amount: 4 } as const;

function escapeXml(text: string): string {
  return text
    .replace(INVALID_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** « A », « B »… « AA » */
export function columnName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

/** Jour Excel (1900, base 30/12/1899) d'une date calendaire, sans fuseau. */
function excelSerial(year: number, month: number, day: number, hours = 0, minutes = 0): number {
  return Date.UTC(year, month - 1, day) / 86_400_000 + 25_569 + (hours * 60 + minutes) / 1_440;
}

/** Nom d'onglet valide : 31 caractères, sans []:*?/\ , unique. */
export function sheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Feuille";
  let candidate = base;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

function cellXml(ref: string, value: XlsxCell, amount: boolean): { xml: string; width: number } {
  if (value === null || value === undefined || value === "") return { xml: "", width: 0 };
  if (typeof value === "boolean") value = value ? "Oui" : "Non";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { xml: "", width: 0 };
    return { xml: `<c r="${ref}"${amount ? ` s="${STYLE.amount}"` : ""}><v>${value}</v></c>`, width: String(value).length + 3 };
  }
  const date = DATE.exec(value);
  if (date) {
    const serial = excelSerial(Number(date[1]), Number(date[2]), Number(date[3]));
    return { xml: `<c r="${ref}" s="${STYLE.date}"><v>${serial}</v></c>`, width: 11 };
  }
  const dateTime = DATE_TIME.exec(value);
  if (dateTime) {
    const [, y, mo, d, h, mi] = dateTime.map(Number);
    return { xml: `<c r="${ref}" s="${STYLE.dateTime}"><v>${excelSerial(y, mo, d, h, mi)}</v></c>`, width: 17 };
  }
  return { xml: `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`, width: value.length };
}

function sheetXml(sheet: XlsxSheet): string {
  const amounts = sheet.columns.map((column) => /MAD/.test(column));
  const widths = sheet.columns.map((column) => column.length + 2);
  const rows: string[] = [];
  const header = sheet.columns
    .map((column, index) => `<c r="${columnName(index)}1" t="inlineStr" s="${STYLE.header}"><is><t>${escapeXml(column)}</t></is></c>`)
    .join("");
  rows.push(`<row r="1">${header}</row>`);
  sheet.rows.forEach((row, rowIndex) => {
    const r = rowIndex + 2;
    const cells = row
      .map((value, index) => {
        const cell = cellXml(`${columnName(index)}${r}`, value, amounts[index] ?? false);
        widths[index] = Math.max(widths[index] ?? 8, cell.width + 1);
        return cell.xml;
      })
      .join("");
    rows.push(`<row r="${r}">${cells}</row>`);
  });
  const lastColumn = columnName(Math.max(sheet.columns.length - 1, 0));
  const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${Math.min(Math.max(width, 8), 60)}" customWidth="1"/>`);
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    (cols.length > 0 ? `<cols>${cols.join("")}</cols>` : "") +
    `<sheetData>${rows.join("")}</sheetData>` +
    (sheet.columns.length > 0 ? `<autoFilter ref="A1:${lastColumn}${sheet.rows.length + 1}"/>` : "") +
    `</worksheet>`
  );
}

const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy hh:mm"/></numFmts>` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="5">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

/** Classeur complet (octets du fichier .xlsx). */
export function buildXlsx(sheets: readonly XlsxSheet[]): Uint8Array {
  const used = new Set<string>();
  const names = sheets.map((sheet) => sheetName(sheet.name, used));
  const files: Zippable = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        sheets
          .map(
            (_, index) =>
              `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join("") +
        `</Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets>${names.map((name, index) => `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets>` +
        `<definedNames>${sheets
          .map((sheet, index) =>
            sheet.columns.length > 0
              ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${index}" hidden="1">'${escapeXml(names[index].replace(/'/g, "''"))}'!$A$1:$${columnName(sheet.columns.length - 1)}$${sheet.rows.length + 1}</definedName>`
              : "",
          )
          .join("")}</definedNames>` +
        `</workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        sheets
          .map(
            (_, index) =>
              `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
          )
          .join("") +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`,
    ),
    "xl/styles.xml": strToU8(STYLES),
  };
  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(sheetXml(sheet));
  });
  return zipSync(files, { level: 6 });
}
