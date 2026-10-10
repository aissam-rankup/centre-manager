import "server-only";

import { cookies, headers } from "next/headers";
import { cache } from "react";

import { appLocale, type Locale, LOCALE_COOKIE, resolveLocale } from "@/lib/i18n/locale";

/** Langue de la requête : cookie du choix, sinon Accept-Language, sinon français. */
export const getLocale = cache(async (): Promise<Locale> => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerStore.get("accept-language"));
});

/** Langue des écrans de l'application (vitrine exclue : elle a déjà l'arabe). */
export const getAppLocale = cache(async (): Promise<Locale> => appLocale(await getLocale()));
