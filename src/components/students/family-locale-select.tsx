"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { NativeSelect } from "@/components/ui/native-select";
import { setStudentMessageLocale } from "@/lib/actions/family-locale";
import { useLabels, useMessage } from "@/lib/i18n/client";
import { isLocale, type Locale, LOCALE_NAMES, LOCALES } from "@/lib/i18n/locale";

/**
 * Langue des messages et documents remis à une famille (WhatsApp, reçus, fiche
 * d'assiduité) : celle du centre par défaut, ou une langue propre.
 */
export function FamilyLocaleSelect({
  studentId,
  value,
  centerLocale,
  readOnly,
}: {
  studentId: string;
  /** Langue propre de la famille ; null : langue du centre. */
  value: Locale | null;
  centerLocale: Locale;
  readOnly: boolean;
}) {
  const F = useLabels().centerSettings.familyLocale;
  const message = useMessage();
  const router = useRouter();
  const [current, setCurrent] = useState<Locale | null>(value);
  const [pending, startTransition] = useTransition();

  const change = (next: Locale | null) => {
    const previous = current;
    setCurrent(next);
    startTransition(async () => {
      const result = await setStudentMessageLocale({ studentId, locale: next });
      if (result.ok) {
        toast.success(F.saved);
        router.refresh();
      } else {
        setCurrent(previous);
        toast.error(message(result.error));
      }
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-card p-4 shadow-card sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex items-start gap-3">
        <Languages className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="flex flex-col">
          <label htmlFor={`family-locale-${studentId}`} className="font-medium text-heading">
            {F.label}
          </label>
          <span className="text-caption text-muted-foreground">{F.studentHint}</span>
        </div>
      </div>
      <NativeSelect
        id={`family-locale-${studentId}`}
        className="sm:w-64"
        value={current ?? ""}
        disabled={readOnly || pending}
        onChange={(event) => change(isLocale(event.target.value) ? event.target.value : null)}
      >
        <option value="">{F.centerDefault(LOCALE_NAMES[centerLocale])}</option>
        {LOCALES.map((locale) => (
          <option key={locale} value={locale} lang={locale}>
            {LOCALE_NAMES[locale]}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
