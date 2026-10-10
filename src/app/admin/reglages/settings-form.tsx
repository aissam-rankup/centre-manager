"use client";

import { LoaderCircle, RotateCcw, Save } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/shared/form-field";
import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updateCenterSettings } from "@/lib/actions/receipts";
import type { CenterReceiptSettings } from "@/lib/data/receipts";
import { useLabels, useMessage } from "@/lib/i18n/client";
import { useModules } from "@/lib/modules-client";
import { RECEIPT_FORMATS, type ReceiptFormat, renderReceiptMessage } from "@/lib/receipts";
import { cn } from "@/lib/utils";

type Errors = Partial<Record<"address" | "phone" | "receiptFormat" | "whatsappTemplate", string>>;

export function CenterSettingsForm({ settings, centerName }: { settings: CenterReceiptSettings; centerName: string }) {
  const LABELS = useLabels();
  const message = useMessage();
  const receipts = useModules().has("finance");
  const C = LABELS.centerSettings;
  const T = LABELS.receipts.tokens;
  const [address, setAddress] = useState(settings.address ?? "");
  const [phone, setPhone] = useState(settings.phone ?? "");
  const [format, setFormat] = useState<ReceiptFormat>(settings.receiptFormat);
  const [template, setTemplate] = useState(settings.whatsappTemplate ?? LABELS.receipts.whatsappTemplate);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const templateRef = useRef<HTMLTextAreaElement>(null);

  const preview = renderReceiptMessage(
    template,
    { ...C.sample, center: centerName },
    LABELS,
  );

  // Variable insérée à l'emplacement du curseur.
  const insertToken = (token: string) => {
    const field = templateRef.current;
    const start = field?.selectionStart ?? template.length;
    const end = field?.selectionEnd ?? template.length;
    const next = `${template.slice(0, start)}${token}${template.slice(end)}`;
    setTemplate(next);
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setErrors({});
    startTransition(async () => {
      const result = await updateCenterSettings({ address, phone, receiptFormat: format, whatsappTemplate: template });
      if (!result.ok) {
        setError(result.error);
        setErrors(result.fieldErrors ?? {});
        return;
      }
      toast.success(C.saved);
    });
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <SectionCard title={C.contactTitle} description={C.contactDescription}>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField id="centre-adresse" label={C.address} error={errors.address}>
            <Input value={address} maxLength={200} onChange={(event) => setAddress(event.target.value)} autoComplete="street-address" />
          </FormField>
          <FormField id="centre-telephone" label={C.phone} error={errors.phone}>
            <Input type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" />
          </FormField>
        </div>
      </SectionCard>

      {/* Format et message des reçus : module Finance. */}
      {receipts ? (
        <SectionCard title={C.receiptsTitle}>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-table font-medium">{C.format}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {RECEIPT_FORMATS.map((value) => (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer flex-col gap-0.5 rounded-xl border px-4 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    format === value ? "border-primary bg-primary-soft" : "hover:bg-muted",
                  )}
                >
                  <input
                    type="radio"
                    name="format-recu"
                    value={value}
                    checked={format === value}
                    onChange={() => setFormat(value)}
                    className="sr-only"
                  />
                  <span className="font-medium">{C.formats[value]}</span>
                  <span className="text-caption text-muted-foreground">{C.formatHints[value]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-2">
            <FormField id="modele-whatsapp" label={C.template} error={errors.whatsappTemplate}>
              <Textarea ref={templateRef} rows={6} maxLength={1000} value={template} onChange={(event) => setTemplate(event.target.value)} />
            </FormField>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-caption text-muted-foreground">{C.templateHint}</span>
              {Object.values(T).map((token) => (
                <button
                  key={token}
                  type="button"
                  onClick={() => insertToken(token)}
                  className="rounded-full border px-2.5 py-0.5 text-caption font-medium transition-colors hover:bg-muted"
                >
                  {token}
                </button>
              ))}
              <Button type="button" variant="ghost" className="ml-auto" onClick={() => setTemplate(LABELS.receipts.whatsappTemplate)}>
                <RotateCcw aria-hidden />
                {C.templateReset}
              </Button>
            </div>
            <div className="flex flex-col gap-1 rounded-xl bg-muted px-4 py-3">
              <span className="text-caption font-medium text-muted-foreground">{C.preview}</span>
              <p className="whitespace-pre-line">{preview}</p>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-danger-ink">
          {message(error)}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="self-end">
        {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Save aria-hidden />}
        {C.save}
      </Button>
    </form>
  );
}
