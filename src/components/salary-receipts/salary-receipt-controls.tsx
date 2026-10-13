"use client";

import { ArrowLeft, Ban, LoaderCircle, MessageCircle, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { FormDialog } from "@/components/admin/form-dialog";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cancelSalaryReceipt, markSalaryReceiptPrinted, prepareSalaryReceiptShare } from "@/lib/actions/salary-receipts";
import { useLabels, useMessage } from "@/lib/i18n/client";
import { isValidPhone, toWhatsAppHref } from "@/lib/phone";
import { SALARY_RECEIPT_LINK_DAYS } from "@/lib/salary-receipts";

type SalaryReceiptControlsProps = {
  receiptId: string;
  receiptNumber: string;
  /** Reçu de versement non annulé : il peut être annulé. */
  cancellable: boolean;
  /** Ouvert depuis « Imprimer » : la boîte d'impression s'ouvre d'elle-même. */
  autoPrint: boolean;
  backHref: string;
};

/** Barre d'actions du reçu de paie (masquée à l'impression). */
export function SalaryReceiptControls({ receiptId, receiptNumber, cancellable, autoPrint, backHref }: SalaryReceiptControlsProps) {
  const LABELS = useLabels();
  const started = useRef(false);

  const print = useCallback(() => {
    void markSalaryReceiptPrinted(receiptId);
    window.print();
  }, [receiptId]);

  useEffect(() => {
    if (!autoPrint || started.current) return;
    started.current = true;
    // Laisse le temps au logo de se charger avant l'aperçu d'impression.
    const timer = window.setTimeout(print, 400);
    return () => window.clearTimeout(timer);
  }, [autoPrint, print]);

  return (
    <div className="mx-auto mb-4 flex w-full max-w-[148mm] flex-wrap items-center gap-2 print:hidden">
      <Button asChild variant="ghost" className="-ms-3 me-auto">
        <a href={backHref}>
          <ArrowLeft aria-hidden />
          {LABELS.salaryReceipts.back}
        </a>
      </Button>
      <Button type="button" onClick={print}>
        <Printer aria-hidden />
        {LABELS.receipts.print}
      </Button>
      <ShareSalaryReceiptButton receiptId={receiptId} />
      {cancellable ? <CancelSalaryReceiptButton receiptId={receiptId} receiptNumber={receiptNumber} /> : null}
    </div>
  );
}

/**
 * Envoi WhatsApp : le serveur prépare le PDF, le lien signé et le message ;
 * l'admin vérifie le numéro et modifie le message, puis ouvre WhatsApp.
 */
function ShareSalaryReceiptButton({ receiptId }: { receiptId: string }) {
  const LABELS = useLabels();
  const S = LABELS.salaryReceipts.share;
  const message = useMessage();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("");
  const [hadPhone, setHadPhone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prepare = () => {
    setError(null);
    startTransition(async () => {
      const result = await prepareSalaryReceiptShare(receiptId);
      if (!result.ok) {
        toast.error(message(result.error));
        return;
      }
      setPhone(result.data.phone ?? "");
      setHadPhone(Boolean(result.data.phone));
      setText(result.data.message);
      setOpen(true);
      router.refresh();
    });
  };

  const href = isValidPhone(phone) && text.trim() ? `${toWhatsAppHref(phone)}?text=${encodeURIComponent(text)}` : null;

  return (
    <>
      <Button type="button" variant="success" onClick={prepare} disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <MessageCircle aria-hidden />}
        {pending ? S.preparing : S.trigger}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <div className="flex min-w-0 flex-col gap-5">
            <DialogHeader>
              <DialogTitle className="text-section">{S.title}</DialogTitle>
              <DialogDescription>{hadPhone ? S.description : S.noPhone}</DialogDescription>
            </DialogHeader>
            <FormField id={`whatsapp-paie-${receiptId}`} label={S.phone} error={error ?? undefined}>
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  setError(null);
                }}
                onBlur={() => setError(phone && !isValidPhone(phone) ? S.phoneInvalid : null)}
                placeholder="06 12 34 56 78"
              />
            </FormField>
            <FormField id={`message-paie-${receiptId}`} label={S.message} hint={S.linkHint(SALARY_RECEIPT_LINK_DAYS)}>
              <Textarea
                rows={7}
                maxLength={1000}
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="[overflow-wrap:anywhere]"
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {LABELS.common.cancel}
              </Button>
              {href ? (
                <Button asChild variant="success">
                  <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
                    <MessageCircle aria-hidden />
                    {S.open}
                  </a>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="success"
                  onClick={() => setError(!isValidPhone(phone) ? S.phoneInvalid : S.messageRequired)}
                >
                  <MessageCircle aria-hidden />
                  {S.open}
                </Button>
              )}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Annulation (admin) : motif obligatoire, reçu d'annulation lié. */
function CancelSalaryReceiptButton({ receiptId, receiptNumber }: { receiptId: string; receiptNumber: string }) {
  const LABELS = useLabels();
  const C = LABELS.salaryReceipts.cancel;
  const message = useMessage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <FormDialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setReason("");
          setError(null);
        }
      }}
      title={C.title(receiptNumber)}
      description={C.description}
      pending={pending}
      error={error}
      submitLabel={C.confirm}
      onSubmit={(event) => {
        event.preventDefault();
        if (!reason.trim()) {
          setError(C.reasonRequired);
          return;
        }
        startTransition(async () => {
          const result = await cancelSalaryReceipt({ receiptId, reason });
          if (!result.ok) {
            setError(message(result.error));
            return;
          }
          toast.success(C.done);
          setOpen(false);
          router.refresh();
        });
      }}
      trigger={
        <Button type="button" variant="ghost" className="text-danger-ink">
          <Ban aria-hidden />
          {C.trigger}
        </Button>
      }
    >
      <FormField id={`annulation-paie-${receiptId}`} label={C.reason}>
        <Textarea rows={3} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} />
      </FormField>
    </FormDialog>
  );
}
