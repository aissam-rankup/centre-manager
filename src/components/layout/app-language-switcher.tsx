"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/vitrine/language-switcher";
import { setLocale } from "@/lib/i18n/actions";
import { useLabels, useLocale } from "@/lib/i18n/client";
import { APP_LOCALES, LOCALE_NAMES } from "@/lib/i18n/locale";

/**
 * Choix de la langue de l'application, propre à chaque utilisateur (mémorisé dans son navigateur).
 * Compact : un seul bouton vers l'autre langue (en-têtes étroits, téléphone).
 */
export function AppLanguageSwitcher({ compact = false, className }: { compact?: boolean; className?: string }) {
  const locale = useLocale();
  const label = useLabels().common.language;
  const [pending, startTransition] = useTransition();
  if (APP_LOCALES.length < 2) return null;

  const other = APP_LOCALES.find((option) => option !== locale);
  if (compact && APP_LOCALES.length === 2 && other) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        lang={other}
        disabled={pending}
        aria-label={LOCALE_NAMES[other]}
        title={LOCALE_NAMES[other]}
        className={className}
        onClick={() =>
          startTransition(async () => {
            try {
              await setLocale(other);
            } catch {
              // Nouvel essai au prochain clic.
            }
          })
        }
      >
        <span className="text-caption font-semibold uppercase">{other}</span>
      </Button>
    );
  }
  return <LanguageSwitcher locale={locale} label={label} locales={APP_LOCALES} className={className} />;
}
