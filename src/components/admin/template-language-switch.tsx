"use client";

import { useLabels } from "@/lib/i18n/client";
import { type Locale, LOCALE_NAMES, LOCALES } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";

const SHORT: Record<Locale, string> = { fr: "FR", en: "EN", ar: "ع" };

/** Langue du modèle en cours d'édition : un modèle par langue, chaque famille reçoit celui de la sienne. */
export function TemplateLanguageSwitch({
  value,
  onChange,
  customized,
}: {
  value: Locale;
  onChange: (locale: Locale) => void;
  /** Langues dont le modèle diffère du message proposé (repère discret). */
  customized: Partial<Record<Locale, boolean>>;
}) {
  const F = useLabels().centerSettings.familyLocale;
  return (
    <div className="flex flex-col gap-1">
      <div role="radiogroup" aria-label={F.templateLanguage} className="inline-flex w-fit items-center rounded-full border border-border bg-card p-0.5">
        {LOCALES.map((locale) => (
          <button
            key={locale}
            type="button"
            role="radio"
            aria-checked={locale === value}
            lang={locale}
            title={LOCALE_NAMES[locale]}
            onClick={() => onChange(locale)}
            className={cn(
              "relative min-w-10 rounded-full px-3 py-1.5 text-caption font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              locale === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-heading",
            )}
          >
            {SHORT[locale]}
            {customized[locale] ? <span className="absolute -top-0.5 -end-0.5 size-2 rounded-full bg-highlight" aria-hidden /> : null}
          </button>
        ))}
      </div>
      <span className="text-caption text-muted-foreground">{F.customTemplateNote}</span>
    </div>
  );
}
