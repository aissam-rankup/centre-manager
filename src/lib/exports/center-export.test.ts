import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { buildCenterExportArchive, csvCell, exportFileName, type ExportData, fileSlug, toSheet } from "@/lib/exports/center-export";
import { columnName, sheetName } from "@/lib/exports/xlsx";

const DATA: ExportData = {
  eleves: {
    title: "Élèves",
    rows: [
      { Nom: "Yasmine Benjelloun", Niveau: "2e année bac", "Téléphone du tuteur": "+212 6 61 12 34 56", Active: true, "Créé le": "2026-09-01 10:30" },
      { Nom: "Rayan <El> & Co", Niveau: "Tronc commun", "Téléphone du tuteur": null, Active: false, "Créé le": "2026-09-02 08:00" },
    ],
  },
  factures: {
    title: "Paiements des élèves",
    rows: [{ Élève: "Yasmine", Échéance: "2026-10-05", "Montant dû (MAD)": 1732.5, Statut: "=HYPERLINK(\"x\")" }],
  },
  caisse: { title: "Sessions de caisse", rows: [] },
};

const META = {
  centerName: "Centre Al Wiam — Casablanca",
  slug: "al-wiam",
  generatedAt: "2026-10-12 14:30",
  periodFrom: null,
  periodTo: null,
  reason: "Sauvegarde",
};

function unzip(bytes: Uint8Array): Record<string, string> {
  return Object.fromEntries(Object.entries(unzipSync(bytes)).map(([name, content]) => [name, strFromU8(content)]));
}

describe("archive d'export", () => {
  const files = unzip(buildCenterExportArchive(DATA, META));

  it("contient le classeur, un CSV par onglet et un LISEZMOI", () => {
    expect(Object.keys(files).sort()).toEqual([
      "LISEZMOI.txt",
      "al-wiam-donnees.xlsx",
      "csv/01-eleves.csv",
      "csv/02-factures.csv",
      "csv/03-caisse.csv",
    ]);
  });

  it("CSV en UTF-8 avec BOM, « ; », accents conservés", () => {
    const raw = unzipSync(buildCenterExportArchive(DATA, META))["csv/01-eleves.csv"];
    expect([...raw.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = files["csv/01-eleves.csv"];
    expect(csv).toContain("Nom;Niveau;Téléphone du tuteur;Active;Créé le");
    expect(csv).toContain("Yasmine Benjelloun;2e année bac;'+212 6 61 12 34 56;Oui;2026-09-01 10:30");
    expect(files["csv/02-factures.csv"]).toContain("1732,5");
  });

  it("aucune formule exécutée à l'ouverture d'un CSV", () => {
    expect(files["csv/02-factures.csv"]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("-12")).toBe("'-12");
    expect(csvCell(-12)).toBe(-12);
  });

  it("onglet vide : une ligne « Aucune donnée »", () => {
    expect(toSheet(DATA.caisse)).toEqual({ name: "Sessions de caisse", columns: ["Aucune donnée"], rows: [] });
  });

  it("classeur Excel : onglets nommés, dates et montants numériques, texte échappé", () => {
    const workbook = unzip(new Uint8Array(unzipSync(buildCenterExportArchive(DATA, META))["al-wiam-donnees.xlsx"]));
    expect(workbook["xl/workbook.xml"]).toContain('<sheet name="Élèves" sheetId="1" r:id="rId1"/>');
    expect(workbook["xl/workbook.xml"]).toContain('name="Paiements des élèves"');
    const students = workbook["xl/worksheets/sheet1.xml"];
    expect(students).toContain("Rayan &lt;El&gt; &amp; Co");
    expect(students).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
    expect(students).toContain('<autoFilter ref="A1:E3"/>');
    // 2026-09-01 10:30 → jour Excel 46266 + 10 h 30.
    expect(students).toMatch(/<c r="E2" s="3"><v>46266\.4375<\/v><\/c>/);
    const invoices = workbook["xl/worksheets/sheet2.xml"];
    expect(invoices).toContain('<c r="B2" s="2"><v>46300</v></c>');
    expect(invoices).toContain('<c r="C2" s="4"><v>1732.5</v></c>');
    expect(invoices).toContain("=HYPERLINK(&quot;x&quot;)");
    expect(invoices).not.toContain("<f>");
  });

  it("LISEZMOI : centre, période, motif, aucune donnée sensible annoncée", () => {
    const readme = files["LISEZMOI.txt"];
    expect(readme).toContain("Centre Al Wiam — Casablanca");
    expect(readme).toContain("tout l'historique");
    expect(readme).toContain("Motif : Sauvegarde");
    expect(readme).toContain("csv/01-eleves.csv : Élèves (2 lignes)");
  });
});

describe("noms", () => {
  it("colonnes Excel", () => {
    expect([0, 25, 26, 27, 701, 702].map(columnName)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
  });

  it("onglets : 31 caractères, caractères interdits retirés, uniques", () => {
    const used = new Set<string>();
    expect(sheetName("Élèves / tuteurs [2026]", used)).toBe("Élèves   tuteurs  2026");
    expect(sheetName("Un nom d'onglet beaucoup trop long pour Excel", used)).toHaveLength(31);
    expect(sheetName("élèves   TUTEURS  2026", used)).toBe("élèves   TUTEURS  2026 2");
  });

  it("fichiers", () => {
    expect(fileSlug("Matières et niveaux")).toBe("matieres-et-niveaux");
    expect(exportFileName("al-wiam", "2026-10-12 14:30")).toBe("dirassty-al-wiam-2026-10-12.zip");
  });
});
