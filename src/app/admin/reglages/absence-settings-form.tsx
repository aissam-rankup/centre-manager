"use client";

import { LoaderCircle, RotateCcw, Save } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/shared/form-field";
import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { renderAbsenceMessage } from "@/lib/absences";
import { updateAbsenceAlertsSettings } from "@/lib/actions/absence-alerts";
import type { AbsenceAlertsSettings } from "@/lib/data/absence-alerts";
import { useLabels } from "@/lib/i18n/client";

export function AbsenceSettingsForm({ settings, centerName }: { settings: AbsenceAlertsSettings; centerName: string }) {
  const LABELS = useLabels();
  const A = LABELS.absenceAlerts;
  const S = A.settings;
  const [enabled, setEnabled] = useState(settings.enabled);
  const [template, setTemplate] = useState(settings.template ?? A.template);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const templateRef = useRef<HTMLTextAreaElement>(null);
  const preview = renderAbsenceMessage(template, { ...S.sample, center: centerName }, LABELS);

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
          const result = await updateAbsenceAlertsSettings({ enabled, template });
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
        <FormField id="modele-absence" label={S.template} error={error ?? undefined}>
          <Textarea ref={templateRef} rows={5} maxLength={1000} value={template} onChange={(event) => setTemplate(event.target.value)} />
        </FormField>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-muted-foreground">{S.templateHint}</span>
          {Object.values(A.tokens).map((token) => (
            <button
              key={token}
              type="button"
              onClick={() => insertToken(token)}
              className="rounded-full border px-2.5 py-0.5 text-caption font-medium transition-colors hover:bg-muted"
            >
              {token}
            </button>
          ))}
          <Button type="button" variant="ghost" className="ml-auto" onClick={() => setTemplate(A.template)}>
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
