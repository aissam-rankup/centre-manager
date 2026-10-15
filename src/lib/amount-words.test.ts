import { describe, expect, it } from "vitest";

import { amountInWords } from "@/lib/amount-words";

describe("montant en toutes lettres", () => {
  it("français", () => {
    expect(amountInWords(2500, "fr")).toBe("Deux mille cinq cents dirhams");
    expect(amountInWords(1, "fr")).toBe("Un dirham");
    expect(amountInWords(0, "fr")).toBe("Zéro dirham");
    expect(amountInWords(1000, "fr")).toBe("Mille dirhams");
    expect(amountInWords(1515, "fr")).toBe("Mille cinq cent quinze dirhams");
    expect(amountInWords(80, "fr")).toBe("Quatre-vingts dirhams");
    expect(amountInWords(81, "fr")).toBe("Quatre-vingt-un dirhams");
    expect(amountInWords(71, "fr")).toBe("Soixante et onze dirhams");
    expect(amountInWords(91, "fr")).toBe("Quatre-vingt-onze dirhams");
    expect(amountInWords(21, "fr")).toBe("Vingt et un dirhams");
    expect(amountInWords(200, "fr")).toBe("Deux cents dirhams");
    expect(amountInWords(200_300, "fr")).toBe("Deux cent mille trois cents dirhams");
    expect(amountInWords(80_000, "fr")).toBe("Quatre-vingt mille dirhams");
    expect(amountInWords(2_000_000, "fr")).toBe("Deux millions de dirhams");
    expect(amountInWords(1500.5, "fr")).toBe("Mille cinq cents dirhams et cinquante centimes");
    expect(amountInWords(-3000, "fr")).toBe("Trois mille dirhams");
  });

  it("anglais", () => {
    expect(amountInWords(2500, "en")).toBe("Two thousand five hundred dirhams");
    expect(amountInWords(1515, "en")).toBe("One thousand five hundred fifteen dirhams");
    expect(amountInWords(1, "en")).toBe("One dirham");
    expect(amountInWords(42.01, "en")).toBe("Forty-two dirhams and one centime");
  });

  it("arabe", () => {
    expect(amountInWords(2500, "ar")).toBe("ألفان وخمسمائة درهم");
    expect(amountInWords(3200, "ar")).toBe("ثلاثة آلاف ومئتان درهم");
    expect(amountInWords(1515, "ar")).toBe("ألف وخمسمائة وخمسة عشر درهم");
    expect(amountInWords(25, "ar")).toBe("خمسة وعشرون درهم");
    expect(amountInWords(15_000, "ar")).toBe("خمسة عشر ألف درهم");
    expect(amountInWords(10.5, "ar")).toBe("عشرة درهم وخمسون سنتيم");
  });
});
