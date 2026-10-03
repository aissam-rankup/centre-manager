"use client";

import { LoaderCircle, Save } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/shared/form-field";
import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateCashSettings } from "@/lib/actions/cash";
import { parseCents } from "@/lib/cash";
import type { CashSettings } from "@/lib/data/cash";
import { formatMAD } from "@/lib/format";
import { useLabels } from "@/lib/i18n/client";

export function CashSettingsForm({ settings }: { settings: CashSettings }) {
  const LABELS = useLabels();
  const S = LABELS.cash.settings;
  const [perAssistant, setPerAssistant] = useState(settings.perAssistant);
  const [threshold, setThreshold] = useState(String(settings.threshold).replace(".", ","));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const cents = parseCents(threshold);

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setErrors({});
        startTransition(async () => {
          const result = await updateCashSettings({ perAssistant, threshold });
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
          <input
            type="checkbox"
            checked={perAssistant}
            onChange={(event) => setPerAssistant(event.target.checked)}
            className="mt-1 size-4 accent-[var(--primary)]"
          />
          <span className="flex flex-col">
            <span className="font-medium">{S.perAssistant}</span>
            <span className="text-caption text-muted-foreground">{S.perAssistantHint}</span>
          </span>
        </label>
        <FormField
          id="seuil-ecart"
          label={S.threshold}
          hint={S.thresholdHint(formatMAD((cents ?? Math.round(settings.threshold * 100)) / 100))}
          error={errors.threshold}
        >
          <Input inputMode="decimal" value={threshold} onChange={(event) => setThreshold(event.target.value)} className="numeric w-40 font-normal" />
        </FormField>
        <Button type="submit" disabled={pending} className="self-end">
          {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {LABELS.centerSettings.save}
        </Button>
      </SectionCard>
    </form>
  );
}
