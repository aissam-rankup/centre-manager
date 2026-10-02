"use client";

import { CircleCheck, LoaderCircle, Tag, TriangleAlert } from "lucide-react";
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
import { markInvoicePaid } from "@/lib/actions/assistant";
import { useLabels } from "@/lib/i18n/client";


type MarkPaidButtonProps = {
  invoiceId: string;
  /** Montant formaté (« 400 MAD »). */
  amountLabel: string;
  subjectName: string;
  periodLabel: string;
  /** Facture avec remise : tarif plein barré, remise, net à encaisser. */
  breakdown?: {
    fullLabel: string;
    discountLabel: string;
    /** « Remise 25 % — fratrie » */
    discountReason: string | null;
    conflict: boolean;
  } | null;
};

export function MarkPaidButton({ invoiceId, amountLabel, subjectName, periodLabel, breakdown = null }: MarkPaidButtonProps) {
  const LABELS = useLabels();
  const D = LABELS.discounts.invoice;
  const L = LABELS.assistant.student.payments;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    startTransition(async () => {
      const result = await markInvoicePaid(invoiceId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(L.success, { description: `${subjectName} · ${amountLabel}` });
      setOpen(false);
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="success">
          <CircleCheck aria-hidden />
          {L.markPaid}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-section">{L.confirmTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {breakdown ? L.confirmLead(subjectName, periodLabel) : L.confirmDescription(amountLabel, subjectName, periodLabel)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {breakdown ? (
          <dl className="flex flex-col gap-2 rounded-xl bg-muted px-4 py-3">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">{D.full}</dt>
              <dd className="numeric font-normal text-muted-foreground line-through">{breakdown.fullLabel}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="flex min-w-0 items-center gap-1.5">
                <Tag className="size-4 shrink-0 text-highlight" aria-hidden />
                <span className="truncate">{breakdown.discountReason ?? D.discount}</span>
              </dt>
              <dd className="numeric shrink-0 font-medium text-foreground">{breakdown.discountLabel}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-divider pt-2">
              <dt className="font-semibold">{D.net}</dt>
              <dd className="numeric text-section text-heading">{amountLabel}</dd>
            </div>
            {breakdown.conflict ? (
              <p className="flex items-start gap-1.5 text-caption text-warning-ink">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {D.conflict}
              </p>
            ) : null}
          </dl>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{LABELS.common.cancel}</AlertDialogCancel>
          {/* Bouton simple : la fenêtre reste ouverte pendant l'enregistrement. */}
          <Button variant="success" onClick={confirm} disabled={pending}>
            {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <CircleCheck aria-hidden />}
            {L.confirm}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
