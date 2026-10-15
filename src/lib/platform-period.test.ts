import { describe, expect, it } from "vitest";

import { formatMAD, formatPercent } from "@/lib/format";
import { parsePeriod, periodOptions, trendOf } from "@/lib/platform-period";

const TODAY = "2026-10-12";

describe("parsePeriod", () => {
  it("mois en cours par défaut", () => {
    const parsed = parsePeriod({}, TODAY);
    expect(parsed.selection).toEqual({ kind: "month", anchor: "2026-10-01" });
    expect(parsed.invalid).toBe(false);
  });

  it("mois, trimestre et année choisis", () => {
    expect(parsePeriod({ periode: "month", mois: "2026-08" }, TODAY).selection).toEqual({ kind: "month", anchor: "2026-08-01" });
    expect(parsePeriod({ periode: "quarter", trimestre: "2026-Q2" }, TODAY).selection).toEqual({ kind: "quarter", anchor: "2026-04-01" });
    expect(parsePeriod({ periode: "year", annee: "2025" }, TODAY).selection).toEqual({ kind: "year", anchor: "2025-01-01" });
  });

  it("refuse un mois futur ou mal formé (mois en cours à la place)", () => {
    expect(parsePeriod({ periode: "month", mois: "2027-01" }, TODAY).selection).toEqual({ kind: "month", anchor: "2026-10-01" });
    expect(parsePeriod({ periode: "month", mois: "2026-13" }, TODAY).selection).toEqual({ kind: "month", anchor: "2026-10-01" });
    expect(parsePeriod({ periode: "quarter", trimestre: "2027-Q1" }, TODAY).selection).toEqual({ kind: "quarter", anchor: "2026-10-01" });
  });

  it("période personnalisée valide", () => {
    expect(parsePeriod({ periode: "custom", du: "2026-09-10", au: "2026-09-19" }, TODAY)).toMatchObject({
      selection: { kind: "custom", start: "2026-09-10", end: "2026-09-19" },
      invalid: false,
    });
  });

  it("période personnalisée invalide : signalée, mois en cours affiché", () => {
    for (const params of [
      { periode: "custom", du: "2026-09-19", au: "2026-09-10" },
      { periode: "custom", du: "2026-02-30", au: "2026-03-10" },
      { periode: "custom", du: "", au: "2026-03-10" },
    ]) {
      const parsed = parsePeriod(params, TODAY);
      expect(parsed.invalid).toBe(true);
      expect(parsed.selection).toEqual({ kind: "month", anchor: "2026-10-01" });
      expect(parsed.form.kind).toBe("custom");
    }
  });

  it("type de période inconnu : mois", () => {
    expect(parsePeriod({ periode: "week" }, TODAY).selection.kind).toBe("month");
  });
});

describe("periodOptions", () => {
  it("24 mois, 8 trimestres, 5 ans en remontant depuis aujourd'hui", () => {
    const options = periodOptions(TODAY);
    expect(options.months).toHaveLength(24);
    expect(options.months[0]).toBe("2026-10");
    expect(options.months[10]).toBe("2025-12");
    expect(options.quarters.slice(0, 5)).toEqual(["2026-Q4", "2026-Q3", "2026-Q2", "2026-Q1", "2025-Q4"]);
    expect(options.years).toEqual(["2026", "2025", "2024", "2023", "2022"]);
  });
});

describe("variations et montants", () => {
  it("sens de la variation", () => {
    expect(trendOf(3200)).toBe("up");
    expect(trendOf(-10)).toBe("down");
    expect(trendOf(0)).toBe("stable");
    expect(trendOf(null)).toBeNull();
  });

  it("montants à la marocaine", () => {
    expect(formatMAD(12500).replace(/\s/g, " ")).toBe("12 500 MAD");
    expect(formatMAD(12500.5).replace(/\s/g, " ")).toBe("12 500,50 MAD");
    expect(formatMAD(12500, "fr", { cents: true }).replace(/\s/g, " ")).toBe("12 500,00 MAD");
    expect(formatPercent(0.125).replace(/\s/g, " ")).toBe("12,5 %");
  });
});
