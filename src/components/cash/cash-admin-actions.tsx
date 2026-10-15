"use client";

import { BadgeCheck, LoaderCircle, PenLine } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/shared/form-field";
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
import { recordCashCorrection, validateCashSession } from "@/lib/actions/cash";
import { formatMAD } from "@/lib/format";
import { useLabels, useLocale, useMessage } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/** Validation d'une session clôturée : verrouillage définitif. */
export function ValidateCashSessionButton({ sessionId }: { sessionId: string }) {
  const LABELS = useLabels();
  const V = LABELS.cash.admin.validate;
  const message = useMessage();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setNotes("");
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="success" className="min-h-11">
          <BadgeCheck aria-hidden />
          {V.button}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-section">{V.title}</DialogTitle>
          <DialogDescription>{V.description}</DialogDescription>
        </DialogHeader>
        <FormField id={`validation-${sessionId}`} label={V.notes}>
          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={2} />
        </FormField>
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
          <Button
            variant="success"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await validateCashSession({ sessionId, notes });
                if (!result.ok) {
                  setError(message(result.error));
                  return;
                }
                toast.success(V.done);
                setOpen(false);
              })
            }
          >
            {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <BadgeCheck aria-hidden />}
            {V.action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Correction après clôture : opération du jour, liée à la session, motivée ; les corrections déjà faites sont rappelées. */
export function CorrectCashSessionButton({ sessionId, corrected = 0 }: { sessionId: string; corrected?: number }) {
  const LABELS = useLabels();
  const locale = useLocale();
  const K = LABELS.cash.admin.correct;
  const message = useMessage();
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"in" | "out">("in");
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
          setDirection("in");
          setAmount("");
          setReason("");
          setErrors({});
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="min-h-11">
          <PenLine aria-hidden />
          {K.button}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-section">{K.title}</DialogTitle>
          <DialogDescription>{K.description}</DialogDescription>
        </DialogHeader>
        {corrected !== 0 ? <p className="rounded-lg bg-warning/10 px-4 py-3 font-medium">{K.already(formatMAD(corrected, locale))}</p> : null}
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setErrors({});
            startTransition(async () => {
              const result = await recordCashCorrection({ sessionId, amount, direction, reason });
              if (!result.ok) {
                setErrors({ ...(result.fieldErrors ?? {}), server: result.fieldErrors ? "" : message(result.error) });
                return;
              }
              toast.success(K.done);
              setOpen(false);
            });
          }}
        >
          <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <legend className="sr-only">{K.title}</legend>
            {(["in", "out"] as const).map((value) => (
              <label
                key={value}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-3 text-center text-table font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  direction === value ? "border-primary bg-primary-soft" : "hover:bg-muted",
                )}
              >
                <input type="radio" name={`sens-${sessionId}`} value={value} checked={direction === value} onChange={() => setDirection(value)} className="sr-only" />
                {K.direction[value]}
              </label>
            ))}
          </fieldset>
          <FormField id={`correction-montant-${sessionId}`} label={K.amount} error={errors.amount}>
            <Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="numeric h-11 font-normal" />
          </FormField>
          <FormField id={`correction-motif-${sessionId}`} label={K.reason} error={errors.reason}>
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={K.reasonPlaceholder} maxLength={300} rows={2} />
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
              {K.action}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
