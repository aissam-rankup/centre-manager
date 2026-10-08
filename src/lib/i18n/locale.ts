/**
 * Langues de l'interface. Chaque utilisateur choisit la sienne (sélecteur,
 * mémorisée dans un cookie) ; à défaut, la langue du navigateur, sinon le
 * français. Module sans dépendance serveur : utilisé par les pages et les
 * composants clients.
 */
export const LOCALES = ["fr", "en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "fr";

/** Cookie du choix de langue (un an). */
export const LOCALE_COOKIE = "dirassty_lang";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Nom de chaque langue dans sa propre langue (sélecteur). */
export const LOCALE_NAMES: Record<Locale, string> = { fr: "Français", en: "English", ar: "العربية" };

export function isLocale(value: string | null | undefined): value is Locale {
  return value !== null && value !== undefined && (LOCALES as readonly string[]).includes(value);
}

/** Sens d'écriture : l'arabe se lit de droite à gauche. */
export function dirFor(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** Première langue prise en charge dans l'en-tête Accept-Language (« ar-MA,ar;q=0.9,fr;q=0.8 »). */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((param) => param.trim().startsWith("q="));
      return { language: (tag ?? "").trim().toLowerCase().split("-")[0] ?? "", q: q ? Number(q.trim().slice(2)) : 1 };
    })
    .filter((entry) => entry.language && !Number.isNaN(entry.q))
    .sort((a, b) => b.q - a.q);
  for (const entry of ranked) {
    if (isLocale(entry.language)) return entry.language;
  }
  return null;
}

/** Langue retenue : choix mémorisé, sinon langue du navigateur, sinon français. */
export function resolveLocale(cookieValue: string | null | undefined, acceptLanguage: string | null | undefined): Locale {
  if (isLocale(cookieValue)) return cookieValue;
  return localeFromAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE;
}
