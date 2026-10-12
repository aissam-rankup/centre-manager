"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Download, FileArchive, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { ChoiceItem } from "@/components/shared/choice-item";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { getCenterExportLink, requestCenterExport } from "@/lib/actions/exports";
import type { CenterExport } from "@/lib/data/platform";
import { formatDate, formatDateTime } from "@/lib/format";
import { useLabels, useMessage } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { type CenterExportInput, centerExportSchema, EXPORT_REASONS } from "@/lib/validation/platform";

/** Demande d'export : période, motif (précision pour « autre »). */
export function ExportDialog({ centerId, todayIso }: { centerId: string; todayIso: string }) {
  const LABELS = useLabels();
  const E = LABELS.platformConsole.exports;
  const message = useMessage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const defaults: CenterExportInput = { centerId, scope: "all", from: "", to: todayIso, reasonKind: "client_request", note: "" };
  const form = useForm<CenterExportInput>({ resolver: zodResolver(centerExportSchema), defaultValues: defaults });
  const errors = form.formState.errors;
  const scope = useWatch({ control: form.control, name: "scope" });
  const reasonKind = useWatch({ control: form.control, name: "reasonKind" });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(defaults);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileArchive aria-hidden />
          {E.open}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit((values) =>
              startTransition(async () => {
                const result = await requestCenterExport(values);
                if (!result.ok) {
                  toast.error(message(result.error));
                  return;
                }
                toast.success(E.requested);
                setOpen(false);
                router.refresh();
              }),
            )();
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-section">{E.title}</DialogTitle>
            <DialogDescription>{E.description}</DialogDescription>
          </DialogHeader>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-body font-medium">{E.periodLegend}</legend>
            <Controller
              control={form.control}
              name="scope"
              render={({ field }) => (
                <RadioGroup value={field.value} onValueChange={field.onChange} className="sm:grid-cols-2">
                  <ChoiceItem>
                    <RadioGroupItem value="all" />
                    {E.periodAll}
                  </ChoiceItem>
                  <ChoiceItem>
                    <RadioGroupItem value="range" />
                    {E.periodRange}
                  </ChoiceItem>
                </RadioGroup>
              )}
            />
            {scope === "range" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="export-from" label={E.from} error={errors.from?.message}>
                  <Input type="date" max={todayIso} className="numeric font-normal" {...form.register("from")} />
                </FormField>
                <FormField id="export-to" label={E.to} error={errors.to?.message}>
                  <Input type="date" max={todayIso} className="numeric font-normal" {...form.register("to")} />
                </FormField>
              </div>
            ) : null}
            <p className="text-caption text-muted-foreground">{E.periodHint}</p>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-body font-medium">{E.reasonLegend}</legend>
            <Controller
              control={form.control}
              name="reasonKind"
              render={({ field }) => (
                <RadioGroup value={field.value} onValueChange={field.onChange} className="sm:grid-cols-2">
                  {EXPORT_REASONS.map((value) => (
                    <ChoiceItem key={value}>
                      <RadioGroupItem value={value} />
                      {E.reasons[value]}
                    </ChoiceItem>
                  ))}
                </RadioGroup>
              )}
            />
          </fieldset>
          <FormField id="export-note" label={reasonKind === "other" ? E.note : E.noteOptional} error={errors.note ? E.noteRequired : undefined}>
            <Textarea rows={2} maxLength={300} {...form.register("note")} />
          </FormField>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {LABELS.common.cancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <FileArchive aria-hidden />}
              {E.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DownloadButton({ exportId }: { exportId: string }) {
  const E = useLabels().platformConsole.exports;
  const message = useMessage();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await getCenterExportLink(exportId);
          if (!result.ok || !result.data) {
            toast.error(message(result.ok ? E.linkUnavailable : result.error));
            return;
          }
          window.location.assign(result.data.url);
        })
      }
    >
      {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Download aria-hidden />}
      {E.download}
    </Button>
  );
}

const STATUS_TONE: Record<string, string> = {
  pending: "text-warning-ink",
  ready: "text-success-ink",
  failed: "text-danger-ink",
  expired: "text-muted-foreground",
};

/** Exports du centre ; actualisation automatique tant qu'un export est en préparation. */
export function CenterExportList({ exports }: { exports: CenterExport[] }) {
  const LABELS = useLabels();
  const E = LABELS.platformConsole.exports;
  const router = useRouter();
  const preparing = exports.some((item) => item.status === "pending");

  useEffect(() => {
    if (!preparing) return;
    const timer = window.setInterval(() => router.refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [preparing, router]);

  if (exports.length === 0) return <p className="text-muted-foreground">{E.listEmpty}</p>;
  return (
    <ul className="flex flex-col divide-y divide-divider">
      {exports.map((item) => (
        <li key={item.export_id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-x-2 font-medium text-heading">
              <span className={cn("flex items-center gap-1.5", STATUS_TONE[item.status])}>
                {item.status === "pending" ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                {E.status[item.status] ?? item.status}
              </span>
              <span className="text-muted-foreground">·</span>
              <span>{E.reasons[item.reason_kind] ?? item.reason_kind}</span>
              {item.file_size !== null ? (
                <span className="text-caption font-normal text-muted-foreground">
                  ({E.size((item.file_size / 1_048_576).toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }))})
                </span>
              ) : null}
            </span>
            {item.reason_note ? <span className="text-caption text-foreground">{LABELS.platform.reason(item.reason_note)}</span> : null}
            <span className="text-caption text-muted-foreground">
              {item.period_from && item.period_to ? E.period(formatDate(item.period_from), formatDate(item.period_to)) : E.allHistory}
              {" · "}
              {E.requestedBy(item.requested_by_name ?? LABELS.platform.center.automatic, formatDateTime(item.created_at))}
            </span>
            {item.status === "ready" ? (
              <span className="text-caption text-muted-foreground">{E.expiresAt(formatDateTime(item.expires_at))}</span>
            ) : null}
          </div>
          {item.status === "ready" ? <DownloadButton exportId={item.export_id} /> : null}
        </li>
      ))}
    </ul>
  );
}
