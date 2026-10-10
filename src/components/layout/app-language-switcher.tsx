"use client";

import { LanguageSwitcher } from "@/components/vitrine/language-switcher";
import { useLabels, useLocale } from "@/lib/i18n/client";
import { APP_LOCALES } from "@/lib/i18n/locale";

/** Choix de la langue de l'application, propre à chaque utilisateur (mémorisé dans son navigateur). */
export function AppLanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const label = useLabels().common.language;
  if (APP_LOCALES.length < 2) return null;
  return <LanguageSwitcher locale={locale} label={label} locales={APP_LOCALES} className={className} />;
}
