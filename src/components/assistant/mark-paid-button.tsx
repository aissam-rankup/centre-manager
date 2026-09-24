"use client";

import { CircleCheck, LoaderCircle } from "lucide-react";
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
import { LABELS } from "@/lib/constants/labels";

const L = LABELS.assistant.student.payments;

type MarkPaidButtonProps = {
  invoiceId: string;
  /** Montant formaté (« 400 MAD »). */
  amountLabel: string;
  subjectName: string;
  periodLabel: string;
};

export function MarkPaidButton({ invoiceId, amountLabel, subjectName, periodLabel }: MarkPaidButtonProps) {
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
          <AlertDialogDescription>{L.confirmDescription(amountLabel, subjectName, periodLabel)}</AlertDialogDescription>
        </AlertDialogHeader>
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
