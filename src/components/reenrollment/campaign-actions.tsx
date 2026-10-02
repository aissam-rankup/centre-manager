"use client";

import { CalendarOff, CircleCheckBig, LoaderCircle, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cancelBillingRun, confirmBillingRun } from "@/lib/actions/reenrollment";
import { useLabels } from "@/lib/i18n/client";

type ConfirmCampaignButtonProps = {
  runId: string;
  monthName: string;
  students: number;
  invoices: number;
  total: string;
  pending: number;
  dropped: number;
  paused: number;
  /** Élèves à risque encore sans décision. */
  riskPending: number;
};

/** Confirmation par l'admin : résumé, élèves à risque non traités, puis émission des factures. */
export function ConfirmCampaignButton(props: ConfirmCampaignButtonProps) {
  const LABELS = useLabels();
  const C = LABELS.reenrollment.review.confirm;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setError(null);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button className="min-h-11">
          <CircleCheckBig aria-hidden />
          {C.button}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-section">{C.title(props.monthName)}</AlertDialogTitle>
          <AlertDialogDescription>{C.summary(props.students, props.invoices, props.total)}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-3">
          <p>{C.decisions(props.pending, props.dropped, props.paused)}</p>
          {props.riskPending > 0 ? (
            <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-4 py-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-ink" aria-hidden />
              {C.riskWarning(props.riskPending)}
            </p>
          ) : null}
          <p className="text-caption text-muted-foreground">{C.irreversible}</p>
          {error ? (
            <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-danger-ink">
              {error}
            </p>
          ) : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{LABELS.common.cancel}</AlertDialogCancel>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await confirmBillingRun(props.runId);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                toast.success(C.done(result.data.invoices));
                setOpen(false);
              })
            }
          >
            {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
            {C.action}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Mois sans cours (admin) : motif obligatoire, choix définitif. */
export function CancelCampaignButton({ runId, monthName }: { runId: string; monthName: string }) {
  const LABELS = useLabels();
  const C = LABELS.reenrollment.review.cancel;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="min-h-11">
          <CalendarOff aria-hidden />
          {C.button}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-section">{C.title(monthName)}</DialogTitle>
          <DialogDescription>{C.description}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              setError(null);
              const result = await cancelBillingRun({ runId, reason });
              if (!result.ok) {
                setError(result.fieldErrors?.reason ?? result.error);
                return;
              }
              toast.success(C.done);
              setOpen(false);
            });
          }}
        >
          <label className="flex flex-col gap-2">
            <span className="font-medium">{C.reason}</span>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={C.reasonPlaceholder}
              maxLength={300}
              rows={3}
              aria-invalid={error ? true : undefined}
            />
          </label>
          {error ? (
            <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-danger-ink">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                {LABELS.common.cancel}
              </Button>
            </DialogClose>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
              {C.action}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
