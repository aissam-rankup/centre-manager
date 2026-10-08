"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { setLocale } from "@/lib/i18n/actions";
import { type Locale, LOCALE_NAMES, LOCALES } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";

const SHORT: Record<Locale, string> = { fr: "FR", en: "EN", ar: "ع" };

/** Choix de la langue : mémorisé dans le navigateur (un an), page rendue à nouveau. */
export function LanguageSwitcher({ locale, label, className }: { locale: Locale; label: string; className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const choose = (next: Locale) => {
    if (next === locale) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  };

  return (
    <div
      role="group"
      aria-label={label}
      className={cn("inline-flex items-center rounded-full border border-border bg-card p-0.5", pending && "opacity-70", className)}
    >
      {LOCALES.map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          title={LOCALE_NAMES[option]}
          aria-label={LOCALE_NAMES[option]}
          aria-pressed={option === locale}
          onClick={() => choose(option)}
          className={cn(
            "min-w-9 rounded-full px-2.5 py-1.5 text-caption font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
            option === locale ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-heading",
          )}
        >
          {SHORT[option]}
        </button>
      ))}
    </div>
  );
}
