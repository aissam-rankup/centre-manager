"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/shared/form-field";
import { SectionCard } from "@/components/shared/section-card";
import { NativeSelect } from "@/components/ui/native-select";
import { setCenterFamilyLocale } from "@/lib/actions/family-locale";
import { useLabels, useMessage } from "@/lib/i18n/client";
import { isLocale, type Locale, LOCALE_NAMES, LOCALES } from "@/lib/i18n/locale";

/** Langue par défaut des messages et documents remis aux familles ; enregistrée dès le choix. */
export function FamilyLocaleForm({ locale }: { locale: Locale }) {
  const F = useLabels().centerSettings.familyLocale;
  const message = useMessage();
  const [current, setCurrent] = useState<Locale>(locale);
  const [pending, startTransition] = useTransition();

  const change = (next: Locale) => {
    const previous = current;
    setCurrent(next);
    startTransition(async () => {
      const result = await setCenterFamilyLocale({ locale: next });
      if (result.ok) {
        toast.success(F.saved);
      } else {
        setCurrent(previous);
        toast.error(message(result.error));
      }
    });
  };

  return (
    <SectionCard id="langue-familles" title={F.title} description={F.description}>
      <FormField id="langue-familles-choix" label={F.label} className="sm:max-w-xs">
        <NativeSelect value={current} disabled={pending} onChange={(event) => isLocale(event.target.value) && change(event.target.value)}>
          {LOCALES.map((option) => (
            <option key={option} value={option} lang={option}>
              {LOCALE_NAMES[option]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
    </SectionCard>
  );
}
