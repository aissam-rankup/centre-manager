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
import { useLabels } from "@/lib/i18n/client";
import { REMINDER_TYPES, type ReminderSettings, type ReminderType, renderReminderMessage } from "@/lib/reminders";
import { cn } from "@/lib/utils";

export function PaymentRemindersForm({ settings, centerName }: { settings: ReminderSettings; centerName: string }) {
  const LABELS = useLabels();
  const R = LABELS.reenrollment.reminders;
  const S = R.settings;
  const [enabled, setEnabled] = useState(settings.enabled);
  const [daysBefore, setDaysBefore] = useState(String(settings.daysBefore));
  const [templates, setTemplates] = useState<Record<ReminderType, string>>({
    upcoming: settings.templates.upcoming ?? R.templates.upcoming,
    due_today: settings.templates.due_today ?? R.templates.due_today,
    overdue: settings.templates.overdue ?? R.templates.overdue,
  });
  const [editing, setEditing] = useState<ReminderType>("upcoming");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const templateRef = useRef<HTMLTextAreaElement>(null);

  const days = Number(daysBefore);
  const daysValue = Number.isInteger(days) && days >= 0 && days <= 28 ? days : settings.daysBefore;
  const template = templates[editing];
  const preview = renderReminderMessage(template, editing, { ...S.sample, center: centerName }, LABELS);

  const setTemplate = (value: string) => setTemplates((current) => ({ ...current, [editing]: value }));

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
          const result = await updateReminderSettings({ enabled, daysBefore, templates });
          if (!result.ok) {
            setErrors(result.fieldErrors ?? {});
            toast.error(result.error);
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

        <FormField id={`modele-rappel-${editing}`} label={S.template[editing]} error={errors[`templates.${editing}`]}>
          <Textarea ref={templateRef} rows={5} maxLength={1000} value={template} onChange={(event) => setTemplate(event.target.value)} />
        </FormField>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-muted-foreground">{S.templateHint}</span>
          {Object.values(R.tokens).map((token) => (
            <button
              key={token}
              type="button"
              onClick={() => insertToken(token)}
              className="min-h-11 rounded-full border px-3 text-caption font-medium transition-colors hover:bg-muted"
            >
              {token}
            </button>
          ))}
          <Button type="button" variant="ghost" className="ml-auto min-h-11" onClick={() => setTemplate(R.templates[editing])}>
            <RotateCcw aria-hidden />
            {S.reset}
          </Button>
        </div>
        <div className="flex flex-col gap-1 rounded-xl bg-muted px-4 py-3">
          <span className="text-caption font-medium text-muted-foreground">{S.preview}</span>
          <p className="whitespace-pre-line">{preview}</p>
        </div>

        <Button type="submit" disabled={pending} className="self-end">
          {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {LABELS.centerSettings.save}
        </Button>
      </SectionCard>
    </form>
  );
}
