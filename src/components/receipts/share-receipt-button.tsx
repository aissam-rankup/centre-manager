"use client";

import { LoaderCircle, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { shareReceipt } from "@/lib/actions/receipts";
import { useLabels, useMessage } from "@/lib/i18n/client";
import { isValidPhone } from "@/lib/phone";

type ShareReceiptButtonProps = {
  receiptId: string;
  /** Numéro du responsable ; absent : saisi avant l'envoi. */
  guardianPhone: string | null;
  label?: string;
  variant?: "default" | "outline" | "success";
  className?: string;
};

/**
 * Partage WhatsApp : le serveur prépare le PDF et le lien signé, puis
 * WhatsApp s'ouvre avec le message pré-rempli vers le responsable.
 */
export function ShareReceiptButton({ receiptId, guardianPhone, label, variant = "outline", className }: ShareReceiptButtonProps) {
  const LABELS = useLabels();
  const S = LABELS.receipts.share;
  const message = useMessage();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [askPhone, setAskPhone] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const send = (enteredPhone?: string) => {
    // Fenêtre ouverte pendant le clic (sinon bloquée), dirigée vers WhatsApp une fois le lien prêt.
    const target = window.open("about:blank", "_blank");
    startTransition(async () => {
      const result = await shareReceipt({ receiptId, phone: enteredPhone });
      if (!result.ok) {
        target?.close();
        if (result.fieldErrors?.phone) {
          setAskPhone(true);
          setPhoneError(result.fieldErrors.phone);
        } else {
          toast.error(message(result.error));
        }
        return;
      }
      setAskPhone(false);
      if (target) {
        target.location.href = result.data.href;
        toast.success(S.opened);
      } else {
        window.location.assign(result.data.href);
      }
      router.refresh();
    });
  };

  const onClick = () => {
    if (guardianPhone) send();
    else {
      setPhoneError(null);
      setAskPhone(true);
    }
  };

  const submitPhone = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValidPhone(phone)) {
      setPhoneError(S.phoneInvalid);
      return;
    }
    send(phone);
  };

  return (
    <>
      <Button type="button" variant={variant} onClick={onClick} disabled={pending} className={className}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <MessageCircle aria-hidden />}
        {pending ? S.preparing : (label ?? LABELS.receipts.whatsapp)}
      </Button>

      <Dialog open={askPhone} onOpenChange={setAskPhone}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submitPhone} noValidate className="flex flex-col gap-5">
            <DialogHeader>
              <DialogTitle className="text-section">{S.title}</DialogTitle>
              <DialogDescription>{S.noPhone}</DialogDescription>
            </DialogHeader>
            <FormField id={`whatsapp-${receiptId}`} label={S.phone} error={phoneError ?? undefined}>
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="06 12 34 56 78"
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAskPhone(false)} disabled={pending}>
                {LABELS.common.cancel}
              </Button>
              <Button type="submit" variant="success" disabled={pending}>
                {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <MessageCircle aria-hidden />}
                {S.send}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
