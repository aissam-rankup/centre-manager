"use client";

import { LoaderCircle, RotateCcw, Save } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { TemplateLanguageSwitch } from "@/components/admin/template-language-switch";
import { FormField } from "@/components/shared/form-field";
import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateAbsenceAlertsSettings } from "@/lib/actions/absence-alerts";
import type { AbsenceAlertsSettings } from "@/lib/data/absence-alerts";
import type { TemplateLanguagePack } from "@/lib/data/message-templates";
import { useLabels } from "@/lib/i18n/client";
import { dirFor, type Locale } from "@/lib/i18n/locale";
import { fillTemplate } from "@/lib/templates";

export function AbsenceSettingsForm({
  settings,
  centerName,
  packs,
}: {
  settings: AbsenceAlertsSettings;
  centerName: string;
  /** Variables, message proposé et modèle du centre dans chaque langue. */
  packs: TemplateLanguagePack[];
}) {
  const LABELS = useLabels();
  const A = LABELS.absenceAlerts;
  const S = A.settings;
  const packOf = (locale: Locale) => packs.find((pack) => pack.locale === locale) ?? packs[0];
  const [enabled, setEnabled] = useState(settings.enabled);
  const [language, setLanguage] = useState<Locale>("fr");
  const [templates, setTemplates] = useState<Record<Locale, string>>(() => {
    const initial = { fr: "", en: "", ar: "" };
    for (const pack of packs) initial[pack.locale] = pack.current.absence ?? pack.defaults.absence ?? "";
    return initial;
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const templateRef = useRef<HTMLTextAreaElement>(null);

  const pack = packOf(language);
  const template = templates[language];
  const setTemplate = (value: string) => setTemplates((previous) => ({ ...previous, [language]: value }));
  const preview = fillTemplate(template, pack.tokens, pack.canonical, { ...pack.sample, center: centerName });

  const insertToken = (token: string) => {
    const field = templateRef.current;
    const start = field?.selectionStart ?? template.length;
    const end = field?.selectionEnd ?? template.length;
    setTemplate(`${template.slice(0, start)}${token}${template.slice(end)}`);
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await updateAbsenceAlertsSettings({
            enabled,
            template: templates.fr,
            translations: { ar: templates.ar, en: templates.en },
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          toast.success(LABELS.centerSettings.saved);
        });
      }}
    >
      <SectionCard title={S.title} description={S.description}>
        <label className="flex cursor-pointer items-start gap-2">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="mt-1 size-4 accent-[var(--primary)]" />
          <span className="flex flex-col">
            <span className="font-medium">{S.enabled}</span>
            <span className="text-caption text-muted-foreground">{S.enabledHint}</span>
          </span>
        </label>
        <TemplateLanguageSwitch
          value={language}
          onChange={setLanguage}
          customized={Object.fromEntries(packs.map((p) => [p.locale, templates[p.locale] !== (p.defaults.absence ?? "")]))}
        />
        <FormField id="modele-absence" label={S.template} error={error ?? undefined}>
          <Textarea
            key={language}
            lang={language}
            dir={dirFor(language)}
            ref={templateRef}
            rows={5}
            maxLength={1000}
            value={template}
            onChange={(event) => setTemplate(event.target.value)}
          />
        </FormField>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-muted-foreground">{S.templateHint}</span>
          {Object.values(pack.tokens).map((token) => (
            <button
              key={token}
              type="button"
              lang={language}
              onClick={() => insertToken(token)}
              className="rounded-full border px-2.5 py-0.5 text-caption font-medium transition-colors hover:bg-muted"
            >
              {token}
            </button>
          ))}
          <Button type="button" variant="ghost" className="ms-auto" onClick={() => setTemplate(pack.defaults.absence ?? "")}>
            <RotateCcw aria-hidden />
            {S.reset}
          </Button>
        </div>
        <div className="flex flex-col gap-1 rounded-xl bg-muted px-4 py-3">
          <span className="text-caption font-medium text-muted-foreground">{S.preview}</span>
          <p lang={language} dir={dirFor(language)} className="whitespace-pre-line">
            {preview}
          </p>
        </div>
        <Button type="submit" disabled={pending} className="self-end">
          {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {LABELS.centerSettings.save}
        </Button>
      </SectionCard>
    </form>
  );
}
