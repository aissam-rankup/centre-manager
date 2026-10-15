import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { cn, THEME_FONT_SIZES } from "@/lib/utils";

describe("cn", () => {
  it("garde la taille du thème avec une couleur de texte", () => {
    expect(cn("text-caption", "text-muted-foreground")).toBe("text-caption text-muted-foreground");
    expect(cn("px-4 text-table font-medium text-heading")).toBe("px-4 text-table font-medium text-heading");
    expect(cn("numeric text-stat", "text-danger-ink")).toBe("numeric text-stat text-danger-ink");
  });

  it("remplace toujours une taille par une autre, et une couleur par une autre", () => {
    expect(cn("text-caption", "text-body")).toBe("text-body");
    expect(cn("text-body", "text-sm")).toBe("text-sm");
    expect(cn("text-muted-foreground", "text-heading")).toBe("text-heading");
  });

  it("connaît toutes les tailles définies dans le thème", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const themeSizes = [...css.matchAll(/^\s*--text-([a-z]+):/gm)].map((match) => match[1]);
    expect([...new Set(themeSizes)].sort()).toEqual([...THEME_FONT_SIZES].sort());
  });
});
