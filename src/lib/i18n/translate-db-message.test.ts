import { describe, expect, it } from "vitest";

import { DB_MESSAGES } from "@/lib/i18n/db-messages";
import { translateDbMessage } from "@/lib/i18n/translate-db-message";

const percents = (text: string) => (text.match(/%/g) ?? []).length;

describe("messages de la base", () => {
  it("ont autant de valeurs insérées dans chaque langue", () => {
    const mismatched = DB_MESSAGES.filter((m) => percents(m.en) !== percents(m.fr) || percents(m.ar) !== percents(m.fr)).map((m) => m.fr);
    expect(mismatched).toEqual([]);
  });

  it("n'ont pas de doublon", () => {
    expect(new Set(DB_MESSAGES.map((m) => m.fr)).size).toBe(DB_MESSAGES.length);
  });

  it("traduisent un message connu et ignorent un message inconnu", () => {
    const first = DB_MESSAGES.find((m) => !m.fr.includes("%"));
    expect(first).toBeDefined();
    if (!first) return;
    expect(translateDbMessage(first.fr, "en")).toBe(first.en);
    expect(translateDbMessage(first.fr, "ar")).toBe(first.ar);
    expect(translateDbMessage("Message inconnu de la base.", "en")).toBeNull();
  });

  it("reportent les valeurs insérées par la base", () => {
    const withValues = DB_MESSAGES.find((m) => percents(m.fr) === 2);
    if (!withValues) return;
    const sample = withValues.fr.replace("%", "AAA").replace("%", "BBB");
    const english = translateDbMessage(sample, "en");
    expect(english).toContain("AAA");
    expect(english).toContain("BBB");
  });
});
