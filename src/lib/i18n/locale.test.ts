import { describe, expect, it } from "vitest";

import { dirFor, localeFromAcceptLanguage, resolveLocale } from "@/lib/i18n/locale";
import { VITRINE } from "@/lib/vitrine/content";

describe("langue de l'interface", () => {
  it("choix mémorisé en priorité, puis navigateur, puis français", () => {
    expect(resolveLocale("ar", "en-US,en;q=0.9")).toBe("ar");
    expect(resolveLocale(undefined, "en-US,en;q=0.9")).toBe("en");
    expect(resolveLocale("de", "de-DE")).toBe("fr");
    expect(resolveLocale(null, null)).toBe("fr");
  });

  it("Accept-Language : langue prise en charge la mieux classée", () => {
    expect(localeFromAcceptLanguage("de-DE,ar-MA;q=0.8,fr;q=0.9")).toBe("fr");
    expect(localeFromAcceptLanguage("ar-MA,ar;q=0.9,fr;q=0.8")).toBe("ar");
    expect(localeFromAcceptLanguage("es,de")).toBeNull();
  });

  it("l'arabe se lit de droite à gauche", () => {
    expect(dirFor("ar")).toBe("rtl");
    expect(dirFor("fr")).toBe("ltr");
  });

  it("message WhatsApp de la démo dans chaque langue, champs vides omis", () => {
    const request = { name: "Nadia", center: "Centre Al Amal", city: "", phone: "" };
    for (const content of Object.values(VITRINE)) {
      const message = content.demo.message(request);
      expect(message).toContain("Nadia");
      expect(message).toContain("Centre Al Amal");
      expect(message.split("\n")).toHaveLength(3);
    }
  });
});
