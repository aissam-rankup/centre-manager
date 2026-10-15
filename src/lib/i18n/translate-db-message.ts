import { DB_MESSAGES } from "@/lib/i18n/db-messages";
import type { Locale } from "@/lib/i18n/locale";

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Message français → motif : chaque « % » capture la valeur insérée par la base. */
const PATTERNS = DB_MESSAGES.map((message) => ({
  pattern: new RegExp(`^${escape(message.fr).replaceAll("%", "(.+?)")}$`, "s"),
  message,
}));

/**
 * Message d'erreur d'une fonction SQL (rédigé en français, vocabulaire par défaut)
 * dans la langue voulue, avec ses marqueurs de vocabulaire ; null s'il est inconnu.
 */
export function translateDbMessage(text: string, locale: Exclude<Locale, "fr">): string | null {
  for (const { pattern, message } of PATTERNS) {
    const match = pattern.exec(text.trim());
    if (!match) continue;
    const values = match.slice(1);
    let index = 0;
    return message[locale].replace(/%/g, () => values[index++] ?? "");
  }
  return null;
}
