"use client";

import { Ban } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormDialog } from "@/components/admin/form-dialog";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cancelReceipt } from "@/lib/actions/receipts";
import { useLabels, useMessage } from "@/lib/i18n/client";

/** Annulation d'un reçu (admin) : motif obligatoire, reçu d'annulation lié. */
export function CancelReceiptButton({ receiptId, receiptNumber }: { receiptId: string; receiptNumber: string }) {
  const LABELS = useLabels();
  const C = LABELS.receipts.cancel;
  const message = useMessage();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onOpenChange = (value: boolean) => {
    setOpen(value);
    if (value) {
      setReason("");
      setError(null);
    }
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reason.trim()) {
      setError(C.reasonRequired);
      return;
    }
    startTransition(async () => {
      const result = await cancelReceipt({ receiptId, reason });
      if (!result.ok) {
        setError(message(result.error));
        return;
      }
      toast.success(C.done);
      setOpen(false);
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={C.title(receiptNumber)}
      description={C.description}
      pending={pending}
      error={error}
      submitLabel={C.confirm}
      onSubmit={onSubmit}
      trigger={
        <Button type="button" variant="ghost" className="text-danger-ink">
          <Ban aria-hidden />
          {C.trigger}
        </Button>
      }
    >
      <FormField id={`annulation-${receiptId}`} label={C.reason}>
        <Textarea rows={3} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} />
      </FormField>
    </FormDialog>
  );
}
