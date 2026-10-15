"use client";

import { LoaderCircle, RotateCcw, Save } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/shared/form-field";
import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updateReminderSettings } from "@/lib/actions/reminders";
import { useLabels, useMessage } from "@/lib/i18n/client";
import { REMINDER_TYPES, type ReminderSettings, type ReminderType } from "@/lib/reminders";
import { fillTemplate } from "@/lib/templates";
import type { TemplateLanguagePack } from "@/lib/data/message-templates";
import { dirFor, type Locale } from "@/lib/i18n/locale";
import { TemplateLanguageSwitch } from "@/components/admin/template-language-switch";
import { cn } from "@/lib/utils";

export function PaymentRemindersForm({
  settings,
  centerName,
  packs,
}: {
  settings: ReminderSettings;
  centerName: string;
  /** Variables, messages proposés et modèles du centre dans chaque langue. */
  packs: TemplateLanguagePack[];
}) {
  const LABELS = useLabels();
  const message = useMessage();
  const R = LABELS.reenrollment.reminders;
  const S = R.settings;
  const [enabled, setEnabled] = useState(settings.enabled);
  const [daysBefore, setDaysBefore] = useState(String(settings.daysBefore));
  const packOf = (locale: Locale) => packs.find((pack) => pack.locale === locale) ?? packs[0];
  const kindOf = (type: ReminderType) => `reminder_${type}` as const;
  const [language, setLanguage] = useState<Locale>("fr");
  // Un modèle par vague et par langue.
  const [templates, setTemplates] = useState<Record<Locale, Record<ReminderType, string>>>(() => {
    const byLocale = {} as Record<Locale, Record<ReminderType, string>>;
    for (const pack of packs) {
      byLocale[pack.locale] = Object.fromEntries(
        REMINDER_TYPES.map((type) => [type, pack.current[kindOf(type)] ?? pack.defaults[kindOf(type)] ?? ""]),
      ) as Record<ReminderType, string>;
    }
    return byLocale;
  });
  const [editing, setEditing] = useState<ReminderType>("upcoming");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const templateRef = useRef<HTMLTextAreaElement>(null);

  const days = Number(daysBefore);
  const daysValue = Number.isInteger(days) && days >= 0 && days <= 28 ? days : settings.daysBefore;
  const pack = packOf(language);
  const template = templates[language][editing];
  const preview = fillTemplate(template, pack.tokens, pack.canonical, { ...pack.sample, center: centerName });

  const setTemplate = (value: string) =>
    setTemplates((current) => ({ ...current, [language]: { ...current[language], [editing]: value } }));

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
        setErrors({});
        startTransition(async () => {
          const result = await updateReminderSettings({
            enabled,
            daysBefore,
            templates: templates.fr,
            translations: { ar: templates.ar, en: templates.en },
          });
          if (!result.ok) {
            setErrors(result.fieldErrors ?? {});
            toast.error(message(result.error));
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

        <FormField id="rappel-jours-avant" label={S.daysBefore} hint={S.daysBeforeHint(daysValue)} error={errors.daysBefore}>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={28}
            value={daysBefore}
            onChange={(event) => setDaysBefore(event.target.value)}
            className="numeric w-32 font-normal"
          />
        </FormField>

        <div role="group" aria-label={R.waveLabel} className="grid grid-cols-1 gap-1 rounded-lg bg-muted p-1 sm:grid-cols-3">
          {REMINDER_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={editing === type}
              onClick={() => setEditing(type)}
              className={cn(
                "min-h-11 rounded-md px-3 text-caption font-medium transition-colors",
                editing === type ? "bg-card text-heading shadow-card" : "text-muted-foreground hover:text-heading",
                errors[`templates.${type}`] && "text-danger-ink",
              )}
            >
              {S.template[type]}
            </button>
          ))}
        </div>

        <TemplateLanguageSwitch
          value={language}
          onChange={setLanguage}
          customized={Object.fromEntries(
            packs.map((p) => [p.locale, REMINDER_TYPES.some((type) => templates[p.locale][type] !== (p.defaults[kindOf(type)] ?? ""))]),
          )}
        />
        <FormField id={`modele-rappel-${editing}`} label={S.template[editing]} error={language === "fr" ? errors[`templates.${editing}`] : undefined}>
          <Textarea
            key={`${language}-${editing}`}
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
              className="min-h-11 rounded-full border px-3 text-caption font-medium transition-colors hover:bg-muted"
            >
              {token}
            </button>
          ))}
          <Button type="button" variant="ghost" className="ms-auto min-h-11" onClick={() => setTemplate(pack.defaults[kindOf(editing)] ?? "")}>
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
