"use client";

import { CircleCheck, LoaderCircle, Printer, Tag, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { ShareReceiptButton } from "@/components/receipts/share-receipt-button";
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
import { recordPayment } from "@/lib/actions/receipts";
import { ROUTES } from "@/lib/auth/routes";
import type { CashOpening } from "@/lib/cash";
import { formatMAD } from "@/lib/format";
import { useLabels } from "@/lib/i18n/client";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/receipts";
import { cn } from "@/lib/utils";

/** Facture à régler, déjà formatée pour l'écran d'encaissement. */
export type PayableInvoice = {
  id: string;
  subjectName: string;
  periodLabel: string;
  dueLabel: string;
  overdue: boolean;
  /** Échue (à régler aujourd'hui ou en retard) : cochée par défaut. */
  dueNow: boolean;
  amountFull: number;
  discountAmount: number;
  /** « Remise 25 % — fratrie » */
  discountLabel: string | null;
  amountDue: number;
};

type PaymentDialogProps = {
  studentId: string;
  studentName: string;
  guardianPhone: string | null;
  invoices: PayableInvoice[];
  triggerLabel: string;
  /**
   * Pas de caisse ouverte, ou ouverte sans encaissement : le fonds de caisse
   * est demandé, prérempli avec le fonds actuel ; envoyé seulement s'il change.
   */
  cashOpening?: CashOpening;
};

/** Ouverture depuis une ligne de facture (même dialogue, cette seule facture cochée). */
const PAY_EVENT = "centromanager:encaisser";
type PayEventDetail = { studentId: string; invoiceId: string };

export function PayInvoiceButton({ studentId, invoiceId, label }: { studentId: string; invoiceId: string; label: string }) {
  return (
    <Button
      type="button"
      variant="success"
      onClick={() => window.dispatchEvent(new CustomEvent<PayEventDetail>(PAY_EVENT, { detail: { studentId, invoiceId } }))}
    >
      <Wallet aria-hidden />
      {label}
    </Button>
  );
}

type Done = { receiptId: string; receiptNumber: string; amountPaid: number };

/**
 * Dialogue d'encaissement, toujours monté dans la section Paiements : il
 * reste ouvert sur le reçu après l'actualisation de la page (factures réglées).
 */
export function PaymentDialog({
  studentId,
  studentName,
  guardianPhone,
  invoices,
  triggerLabel,
  cashOpening = { needed: false, currentFloat: 0 },
}: PaymentDialogProps) {
  const LABELS = useLabels();
  const P = LABELS.payment;
  const D = LABELS.discounts.invoice;
  const router = useRouter();
  const dueNow = useMemo(() => invoices.filter((invoice) => invoice.dueNow).map((invoice) => invoice.id), [invoices]);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(dueNow));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const initialFloat = String(cashOpening.currentFloat).replace(".", ",");
  const [openingFloat, setOpeningFloat] = useState(initialFloat);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [pending, startTransition] = useTransition();

  const chosen = invoices.filter((invoice) => selected.has(invoice.id));
  const total = chosen.reduce((sum, invoice) => sum + invoice.amountDue, 0);
  const totalFull = chosen.reduce((sum, invoice) => sum + invoice.amountFull, 0);
  const totalDiscount = chosen.reduce((sum, invoice) => sum + invoice.discountAmount, 0);

  const start = useCallback(
    (selection: string[]) => {
      setSelected(new Set(selection));
      setMethod("cash");
      setOpeningFloat(initialFloat);
      setError(null);
      setDone(null);
      setOpen(true);
    },
    [initialFloat],
  );

  const onOpenChange = (value: boolean) => {
    if (value) start(dueNow);
    else {
      setOpen(false);
      if (done) router.refresh();
    }
  };

  useEffect(() => {
    const onPay = (event: Event) => {
      const detail = (event as CustomEvent<PayEventDetail>).detail;
      if (detail.studentId === studentId) start([detail.invoiceId]);
    };
    window.addEventListener(PAY_EVENT, onPay);
    return () => window.removeEventListener(PAY_EVENT, onPay);
  }, [start, studentId]);

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirm = () => {
    if (chosen.length === 0) {
      setError(P.noneSelected);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await recordPayment({
        studentId,
        invoiceIds: chosen.map((invoice) => invoice.id),
        method,
        // Fonds inchangé : rien n'est envoyé (celui saisi entre-temps à la caisse est gardé).
        openingFloat: cashOpening.needed && openingFloat.trim() !== initialFloat ? openingFloat : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(P.success, { description: P.receiptReady(result.data.receiptNumber, formatMAD(result.data.amountPaid)) });
      setDone(result.data);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {invoices.length > 0 ? (
        <DialogTrigger asChild>
          <Button>
            <Wallet aria-hidden />
            {triggerLabel}
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {done ? (
          <div className="flex flex-col gap-5">
            <DialogHeader className="items-center text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-success/15 text-success-ink">
                <CircleCheck className="size-8" aria-hidden />
              </span>
              <DialogTitle className="text-section">{P.success}</DialogTitle>
              <DialogDescription>{P.receiptHint}</DialogDescription>
            </DialogHeader>
            <p className="rounded-xl bg-muted px-4 py-3 text-center">
              <span className="numeric text-section text-heading">
                {P.receiptReady(done.receiptNumber, formatMAD(done.amountPaid))}
              </span>
            </p>
            {/* Les deux actions côte à côte. */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button asChild>
                <a href={`${ROUTES.receipt(done.receiptId)}?imprimer=1`} target="_blank" rel="noopener">
                  <Printer aria-hidden />
                  {LABELS.receipts.print}
                </a>
              </Button>
              <ShareReceiptButton receiptId={done.receiptId} guardianPhone={guardianPhone} variant="success" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {LABELS.receipts.close}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <DialogHeader>
              <DialogTitle className="text-section">{P.title}</DialogTitle>
              <DialogDescription>{P.description(studentName)}</DialogDescription>
            </DialogHeader>

            {invoices.length === 0 ? (
              <p className="text-muted-foreground">{P.nothingToPay}</p>
            ) : (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-caption font-medium text-muted-foreground">{P.invoices}</legend>
                {invoices.map((invoice) => {
                  const checked = selected.has(invoice.id);
                  return (
                    <label
                      key={invoice.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition-colors",
                        checked ? "border-primary bg-primary-soft" : "hover:bg-muted",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(invoice.id)}
                        className="mt-1 size-4 shrink-0 accent-[var(--primary)]"
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="font-medium">{invoice.subjectName}</span>
                        <span className="text-caption text-muted-foreground">{invoice.periodLabel}</span>
                        <span className={cn("text-caption", invoice.overdue ? "font-medium text-danger-ink" : "text-muted-foreground")}>
                          {invoice.overdue ? P.overdue : invoice.dueLabel}
                        </span>
                        {invoice.discountLabel ? (
                          <span className="flex items-center gap-1 text-caption">
                            <Tag className="size-3.5 shrink-0 text-highlight" aria-hidden />
                            {invoice.discountLabel}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex shrink-0 flex-col items-end">
                        {invoice.discountAmount > 0 ? (
                          <span className="numeric text-caption text-muted-foreground line-through">
                            <span className="sr-only">{D.full} : </span>
                            {formatMAD(invoice.amountFull)}
                          </span>
                        ) : null}
                        <span className="numeric font-semibold">
                          <span className="sr-only">{D.net} : </span>
                          {formatMAD(invoice.amountDue)}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            )}

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-caption font-medium text-muted-foreground">{P.method}</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PAYMENT_METHODS.map((value) => (
                  <label
                    key={value}
                    className={cn(
                      "flex h-11 cursor-pointer items-center justify-center rounded-lg border text-table font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                      method === value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                    )}
                  >
                    <input
                      type="radio"
                      name={`mode-${studentId}`}
                      value={value}
                      checked={method === value}
                      onChange={() => setMethod(value)}
                      className="sr-only"
                    />
                    {LABELS.paymentMethods[value]}
                  </label>
                ))}
              </div>
            </fieldset>

            {cashOpening.needed ? (
              <label className="flex flex-col gap-1.5 rounded-xl border border-dashed px-4 py-3">
                <span className="font-medium">{LABELS.cash.openingFloat}</span>
                <span className="text-caption text-muted-foreground">{LABELS.cash.openingFloatHint}</span>
                <Input
                  inputMode="decimal"
                  value={openingFloat}
                  onChange={(event) => setOpeningFloat(event.target.value)}
                  className="numeric h-11 font-normal"
                />
              </label>
            ) : null}

            <dl className="flex flex-col gap-1 rounded-xl bg-muted px-4 py-3">
              {totalDiscount > 0 ? (
                <>
                  <div className="flex justify-between gap-4 text-muted-foreground">
                    <dt>{P.totalFull}</dt>
                    <dd className="numeric line-through">{formatMAD(totalFull)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>{P.totalDiscount}</dt>
                    <dd className="numeric">− {formatMAD(totalDiscount)}</dd>
                  </div>
                </>
              ) : null}
              <div className="flex items-baseline justify-between gap-4">
                <dt className="font-semibold">{P.total}</dt>
                <dd className="numeric text-section text-heading">{formatMAD(total)}</dd>
              </div>
            </dl>

            {error ? (
              <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-danger-ink">
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                {LABELS.common.cancel}
              </Button>
              <Button type="button" variant="success" onClick={confirm} disabled={pending || chosen.length === 0}>
                {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <CircleCheck aria-hidden />}
                {P.confirm(formatMAD(total))}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
