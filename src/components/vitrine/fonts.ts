import { IBM_Plex_Sans_Arabic } from "next/font/google";

import type { Locale } from "@/lib/i18n/locale";

/** Police arabe de la vitrine (Poppins n'a pas de glyphes arabes). */
export const arabicFont = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/** Attributs de langue, de sens et de police, aussi pour les fenêtres ouvertes hors de la page. */
export function localeProps(locale: Locale) {
  const arabic = locale === "ar";
  return {
    lang: locale,
    dir: arabic ? ("rtl" as const) : ("ltr" as const),
    className: arabic ? arabicFont.variable : undefined,
    style: arabic ? { fontFamily: "var(--font-arabic), var(--font-poppins), ui-sans-serif, system-ui, sans-serif" } : undefined,
  };
}
