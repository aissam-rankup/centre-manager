import "server-only";

import { cookies, headers } from "next/headers";
import { cache } from "react";

import { type Locale, LOCALE_COOKIE, resolveLocale } from "@/lib/i18n/locale";

/** Langue de la requête : cookie du choix, sinon Accept-Language, sinon français. */
export const getLocale = cache(async (): Promise<Locale> => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerStore.get("accept-language"));
});
