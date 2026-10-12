"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheck, LoaderCircle, TriangleAlert, Trash2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { sameCenterName } from "@/components/platform/center-actions";
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
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions/result";
import { cancelCenterDeletion, purgeCenterNow, requestCenterDeletion } from "@/lib/actions/deletion";
import type { CenterDeletion, CenterStatus } from "@/lib/data/platform";
import { formatDate, formatDateTime, toISODate } from "@/lib/format";
import { useLabels, useMessage } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import {
  type CancelDeletionInput,
  cancelDeletionSchema,
  type PurgeNowInput,
  purgeNowSchema,
  type RequestDeletionInput,
  requestDeletionSchema,
} from "@/lib/validation/platform";

/** Jours calendaires entre deux dates « AAAA-MM-JJ ». */
function daysBetween(from: string, to: string): number {
  const utc = (iso: string) => {
    const [year, month, day] = iso.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/** Conseil d'export, toujours visible avant une suppression. */
function ExportAdvice({ hasReadyExport }: { hasReadyExport: boolean }) {
  const D = useLabels().platformConsole.deletion;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-caption">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-ink" aria-hidden />
      <div className="flex flex-col gap-0.5">
        <p className="font-medium text-heading">{D.exportFirst}</p>
        <p className={hasReadyExport ? "text-success-ink" : "text-foreground"}>{hasReadyExport ? D.exportReady : D.noExport}</p>
      </div>
    </div>
  );
}

function ConfirmDialog({
  trigger,
  title,
  description,
  submitLabel,
  destructive,
  pending,
  open,
  onOpenChange,
  submitDisabled,
  onSubmit,
  children,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  submitLabel: string;
  destructive?: boolean;
  pending: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitDisabled?: boolean;
  onSubmit: () => void;
  children?: ReactNode;
}) {
  const LABELS = useLabels();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-section">{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              {LABELS.common.cancel}
            </Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending || submitDisabled}>
              {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Envoi d'une action : toast, fermeture, page actualisée. */
function useRun<T>() {
  const message = useMessage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const run = <R,>(action: (input: T) => Promise<ActionResult<R>>, values: T, done: (data: R | undefined) => string) =>
    startTransition(async () => {
      const result = await action(values);
      if (!result.ok) {
        toast.error(message(result.error));
        return;
      }
      toast.success(done(result.data));
      setOpen(false);
      router.refresh();
    });
  return { open, setOpen, pending, run };
}

function RequestDeletionDialog({ centerId, name, hasReadyExport }: { centerId: string; name: string; hasReadyExport: boolean }) {
  const LABELS = useLabels();
  const D = LABELS.platformConsole.deletion;
  const A = LABELS.platformConsole.access;
  const { open, setOpen, pending, run } = useRun<RequestDeletionInput>();
  const defaults: RequestDeletionInput = { centerId, reason: "", confirmName: "" };
  const form = useForm<RequestDeletionInput>({ resolver: zodResolver(requestDeletionSchema), defaultValues: defaults });
  const typed = useWatch({ control: form.control, name: "confirmName" });
  const matches = sameCenterName(typed ?? "", name);
  const errors = form.formState.errors;

  return (
    <ConfirmDialog
      trigger={
        <Button variant="destructive" className="self-start">
          <Trash2 aria-hidden />
          {D.request}
        </Button>
      }
      title={D.request}
      description={D.requestDescription}
      submitLabel={D.submit}
      destructive
      pending={pending}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(defaults);
      }}
      submitDisabled={!matches}
      onSubmit={() =>
        void form.handleSubmit((values) =>
          run(requestCenterDeletion, values, (data) => D.requested(data ? formatDate(data.scheduledFor) : "")),
        )()
      }
    >
      <ExportAdvice hasReadyExport={hasReadyExport} />
      <FormField id="deletion-reason" label={D.reason} error={errors.reason ? D.reasonRequired : undefined}>
        <Textarea rows={2} maxLength={300} placeholder={D.reasonPlaceholder} {...form.register("reason")} />
      </FormField>
      <FormField id="deletion-confirm" label={A.confirmName(name)} error={typed && !matches ? A.confirmMismatch : undefined}>
        <Input autoComplete="off" spellCheck={false} {...form.register("confirmName")} />
      </FormField>
    </ConfirmDialog>
  );
}

function CancelDeletionDialog({ centerId }: { centerId: string }) {
  const LABELS = useLabels();
  const D = LABELS.platformConsole.deletion;
  const { open, setOpen, pending, run } = useRun<CancelDeletionInput>();
  const defaults: CancelDeletionInput = { centerId, note: "" };
  const form = useForm<CancelDeletionInput>({ resolver: zodResolver(cancelDeletionSchema), defaultValues: defaults });

  return (
    <ConfirmDialog
      trigger={
        <Button variant="default">
          <Undo2 aria-hidden />
          {D.cancel}
        </Button>
      }
      title={D.cancelTitle}
      description={D.cancelDescription}
      submitLabel={D.cancel}
      pending={pending}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(defaults);
      }}
      onSubmit={() => void form.handleSubmit((values) => run(cancelCenterDeletion, values, () => D.cancelled))()}
    >
      <FormField id="deletion-cancel-note" label={LABELS.platform.actions.reasonOptional}>
        <Textarea rows={2} maxLength={300} {...form.register("note")} />
      </FormField>
    </ConfirmDialog>
  );
}

function PurgeNowDialog({ centerId, name, hasReadyExport }: { centerId: string; name: string; hasReadyExport: boolean }) {
  const LABELS = useLabels();
  const D = LABELS.platformConsole.deletion;
  const A = LABELS.platformConsole.access;
  const { open, setOpen, pending, run } = useRun<PurgeNowInput>();
  const defaults: PurgeNowInput = { centerId, confirmName: "" };
  const form = useForm<PurgeNowInput>({ resolver: zodResolver(purgeNowSchema), defaultValues: defaults });
  const typed = useWatch({ control: form.control, name: "confirmName" });
  const matches = sameCenterName(typed ?? "", name);

  return (
    <ConfirmDialog
      trigger={
        <Button variant="destructive">
          <Trash2 aria-hidden />
          {D.purgeNow}
        </Button>
      }
      title={D.purgeTitle}
      description={D.purgeDescription}
      submitLabel={D.purgeNow}
      destructive
      pending={pending}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(defaults);
      }}
      submitDisabled={!matches}
      onSubmit={() => void form.handleSubmit((values) => run(purgeCenterNow, values, () => D.purged))()}
    >
      <ExportAdvice hasReadyExport={hasReadyExport} />
      <FormField id="purge-confirm" label={A.confirmName(name)} error={typed && !matches ? A.confirmMismatch : undefined}>
        <Input autoComplete="off" spellCheck={false} {...form.register("confirmName")} />
      </FormField>
    </ConfirmDialog>
  );
}

/** Section « Suppression définitive » de la fiche du centre. */
export function CenterDeletionPanel({
  centerId,
  name,
  status,
  deletion,
  hasReadyExport,
  todayIso,
}: {
  centerId: string;
  name: string;
  status: CenterStatus;
  deletion: CenterDeletion | null;
  hasReadyExport: boolean;
  todayIso: string;
}) {
  const LABELS = useLabels();
  const D = LABELS.platformConsole.deletion;

  if (deletion?.purged_at) {
    return (
      <p className="flex items-start gap-2 text-foreground">
        <CircleCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        {D.purgedBanner(formatDate(deletion.purged_at))}
      </p>
    );
  }

  if (deletion?.scheduled_for) {
    const days = Math.max(0, daysBetween(todayIso, toISODate(deletion.scheduled_for)));
    return (
      <div className="flex flex-col gap-4">
        <div role="status" className={cn("flex flex-col gap-1 rounded-xl border px-4 py-3", "border-danger/30 bg-danger/5")}>
          <p className="font-medium text-heading">
            {deletion.due ? D.bannerDue : D.banner(formatDateTime(deletion.scheduled_for), days)}
          </p>
          {deletion.reason ? <p className="text-caption text-foreground">{LABELS.platform.reason(deletion.reason)}</p> : null}
          {deletion.requested_at ? (
            <p className="text-caption text-muted-foreground">
              {D.requestedBy(deletion.requested_by_name ?? LABELS.platform.center.automatic, formatDateTime(deletion.requested_at))}
            </p>
          ) : null}
        </div>
        <ExportAdvice hasReadyExport={hasReadyExport} />
        <div className="flex flex-wrap gap-2">
          <CancelDeletionDialog centerId={centerId} />
          {deletion.due ? <PurgeNowDialog centerId={centerId} name={name} hasReadyExport={hasReadyExport} /> : null}
        </div>
      </div>
    );
  }

  if (status !== "suspended" && status !== "cancelled") {
    return <p className="text-muted-foreground">{D.activeHint}</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-foreground">{D.idleHint}</p>
      <ExportAdvice hasReadyExport={hasReadyExport} />
      <RequestDeletionDialog centerId={centerId} name={name} hasReadyExport={hasReadyExport} />
    </div>
  );
}
