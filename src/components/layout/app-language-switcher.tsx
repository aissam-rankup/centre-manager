"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LanguageSwitcher } from "@/components/vitrine/language-switcher";
import { setLocale } from "@/lib/i18n/actions";
import { useLabels, useLocale } from "@/lib/i18n/client";
import { APP_LOCALES, isLocale, type Locale, LOCALE_NAMES } from "@/lib/i18n/locale";

const SHORT: Record<Locale, string> = { fr: "FR", en: "EN", ar: "ع" };

/**
 * Choix de la langue de l'application, propre à chaque utilisateur (mémorisé dans son navigateur).
 * Compact (en-têtes étroits, téléphone) : un bouton vers l'autre langue s'il n'y en a que deux, sinon un petit menu.
 */
export function AppLanguageSwitcher({ compact = false, className }: { compact?: boolean; className?: string }) {
  const locale = useLocale();
  const label = useLabels().common.language;
  const [pending, startTransition] = useTransition();
  if (APP_LOCALES.length < 2) return null;

  const choose = (next: Locale) => {
    if (next === locale) return;
    startTransition(async () => {
      try {
        await setLocale(next);
      } catch {
        // Nouvel essai au prochain clic.
      }
    });
  };

  if (!compact) return <LanguageSwitcher locale={locale} label={label} locales={APP_LOCALES} className={className} />;

  const other = APP_LOCALES.find((option) => option !== locale);
  if (APP_LOCALES.length === 2 && other) {
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
        onClick={() => choose(other)}
      >
        <span className="text-caption font-semibold">{SHORT[other]}</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" disabled={pending} aria-label={label} title={label} className={className}>
          <span className="text-caption font-semibold" lang={locale}>
            {SHORT[locale]}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={locale} onValueChange={(value) => isLocale(value) && choose(value)}>
          {APP_LOCALES.map((option) => (
            <DropdownMenuRadioItem key={option} value={option} lang={option}>
              {LOCALE_NAMES[option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
