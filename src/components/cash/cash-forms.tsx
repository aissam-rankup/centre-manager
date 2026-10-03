"use client";

import { ArrowLeftRight, CircleCheck, LoaderCircle, LockKeyhole, Unlock } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/shared/form-field";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { closeCashSession, openCashSession, recordCashMovement } from "@/lib/actions/cash";
import { ADMIN_MOVEMENT_KINDS, ASSISTANT_MOVEMENT_KINDS, parseCents, varianceCents } from "@/lib/cash";
import { formatMAD } from "@/lib/format";
import { useLabels } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/** Ouvrir la caisse maintenant, avec le fonds de caisse. */
export function OpenCashForm() {
  const LABELS = useLabels();
  const C = LABELS.cash;
  const [openingFloat, setOpeningFloat] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      noValidate
      className="flex flex-col gap-4 sm:flex-row sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await openCashSession({ openingFloat });
          if (!result.ok) {
            setError(result.fieldErrors?.openingFloat ?? result.error);
            return;
          }
          toast.success(C.opened);
        });
      }}
    >
      <FormField id="fonds-de-caisse" label={C.openingFloat} hint={C.openingFloatHint} error={error ?? undefined} className="flex-1">
        <Input inputMode="decimal" value={openingFloat} onChange={(event) => setOpeningFloat(event.target.value)} className="numeric h-11 font-normal" />
      </FormField>
      <Button type="submit" className="min-h-11" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Unlock aria-hidden />}
        {C.open}
      </Button>
    </form>
  );
}

/**
 * Clôture : montant compté, écart affiché dès la saisie (vert si nul, rouge
 * sinon, manquant ou excédent), motif obligatoire si l'écart n'est pas nul.
 */
export function CloseCashForm({ sessionId, expectedCash }: { sessionId: string; expectedCash: number }) {
  const LABELS = useLabels();
  const C = LABELS.cash;
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const cents = counted.trim() === "" ? null : parseCents(counted);
  const variance = cents === null ? null : varianceCents(cents, expectedCash);
  const needsReason = variance !== null && variance !== 0;

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (cents === null) next.counted = C.amountInvalid;
    if (needsReason && reason.trim() === "") next.reason = C.varianceReasonRequired;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (validate()) setConfirming(true);
      }}
    >
      <FormField id={`compte-${sessionId}`} label={C.counted} hint={C.countedHint} error={errors.counted}>
        <Input
          inputMode="decimal"
          value={counted}
          onChange={(event) => setCounted(event.target.value)}
          aria-describedby={`ecart-${sessionId}`}
          className="numeric h-11 text-lg font-semibold"
        />
      </FormField>

      <p
        id={`ecart-${sessionId}`}
        role="status"
        className={cn(
          "rounded-xl px-4 py-3 text-lg font-semibold",
          variance === null && "sr-only",
          variance === 0 && "bg-success/10 text-success-ink",
          variance !== null && variance !== 0 && "bg-danger/10 text-danger-ink",
        )}
      >
        {variance === null
          ? ""
          : variance === 0
            ? C.variance.none
            : variance < 0
              ? C.variance.shortage(formatMAD(-variance / 100))
              : C.variance.surplus(formatMAD(variance / 100))}
      </p>

      {needsReason ? (
        <FormField id={`motif-${sessionId}`} label={C.varianceReason} error={errors.reason}>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={C.varianceReasonPlaceholder}
            maxLength={500}
            rows={2}
          />
        </FormField>
      ) : null}

      <FormField id={`notes-${sessionId}`} label={C.notes}>
        <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={2} />
      </FormField>

      <Button type="submit" variant={needsReason ? "danger" : "success"} className="min-h-11 self-stretch sm:self-end" disabled={pending}>
        <LockKeyhole aria-hidden />
        {C.close}
      </Button>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-section">{C.closeConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{C.closeConfirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          {variance !== null ? (
            <p className={cn("rounded-lg px-4 py-3 font-semibold", variance === 0 ? "bg-success/10 text-success-ink" : "bg-danger/10 text-danger-ink")}>
              {C.countedCash} : {formatMAD((cents ?? 0) / 100)} ·{" "}
              {variance === 0
                ? C.variance.none
                : variance < 0
                  ? C.variance.shortage(formatMAD(-variance / 100))
                  : C.variance.surplus(formatMAD(variance / 100))}
            </p>
          ) : null}
          {errors.server ? (
            <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-danger-ink">
              {errors.server}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{LABELS.common.cancel}</AlertDialogCancel>
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await closeCashSession({ sessionId, counted, reason, notes });
                  if (!result.ok) {
                    setErrors({ server: result.fieldErrors?.counted ?? result.error });
                    return;
                  }
                  toast.success(C.closedToast);
                  setConfirming(false);
                })
              }
            >
              {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <CircleCheck aria-hidden />}
              {C.closeConfirm}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

/** Mouvement d'espèces : dépôt en banque, remboursement, ajustement du fonds ; charge et paie pour l'admin. */
export function CashMovementDialog({ finance }: { finance: boolean }) {
  const LABELS = useLabels();
  const C = LABELS.cash;
  const kinds = finance ? ADMIN_MOVEMENT_KINDS : ASSISTANT_MOVEMENT_KINDS;
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<(typeof ADMIN_MOVEMENT_KINDS)[number]>("bank_deposit");
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setKind("bank_deposit");
          setDirection("out");
          setAmount("");
          setReason("");
          setErrors({});
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="min-h-11">
          <ArrowLeftRight aria-hidden />
          {C.addMovement}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-section">{C.movementTitle}</DialogTitle>
          <DialogDescription>{C.movementDescription}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setErrors({});
            startTransition(async () => {
              const result = await recordCashMovement({ kind, amount, direction, reason });
              if (!result.ok) {
                setErrors({ ...(result.fieldErrors ?? {}), server: result.fieldErrors ? "" : result.error });
                return;
              }
              toast.success(C.movementSaved);
              setOpen(false);
            });
          }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-medium">{C.movementKind}</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {kinds.map((value) => (
                <label
                  key={value}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center rounded-lg border px-3 text-table font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    kind === value ? "border-primary bg-primary-soft" : "hover:bg-muted",
                  )}
                >
                  <input type="radio" name="nature-mouvement" value={value} checked={kind === value} onChange={() => setKind(value)} className="sr-only" />
                  {C.movementKinds[value]}
                </label>
              ))}
            </div>
          </fieldset>
          {kind === "float_change" ? (
            <fieldset className="grid grid-cols-2 gap-2">
              <legend className="sr-only">{C.movementKind}</legend>
              {(["in", "out"] as const).map((value) => (
                <label
                  key={value}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center justify-center rounded-lg border text-table font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    direction === value ? "border-primary bg-primary-soft" : "hover:bg-muted",
                  )}
                >
                  <input type="radio" name="sens-mouvement" value={value} checked={direction === value} onChange={() => setDirection(value)} className="sr-only" />
                  {C.movementDirection[value]}
                </label>
              ))}
            </fieldset>
          ) : null}
          <FormField id="montant-mouvement" label={C.movementAmount} error={errors.amount}>
            <Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="numeric h-11 font-normal" />
          </FormField>
          <FormField id="motif-mouvement" label={C.movementReason} error={errors.reason}>
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={C.movementReasonPlaceholder} maxLength={300} rows={2} />
          </FormField>
          {errors.server ? (
            <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-danger-ink">
              {errors.server}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                {LABELS.common.cancel}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
              {C.movementSave}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
