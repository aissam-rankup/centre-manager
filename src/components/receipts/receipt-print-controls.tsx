"use client";

import { ArrowLeft, Printer } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import { ShareReceiptButton } from "@/components/receipts/share-receipt-button";
import { Button } from "@/components/ui/button";
import { markReceiptPrinted } from "@/lib/actions/receipts";
import { useLabels } from "@/lib/i18n/client";

type ReceiptPrintControlsProps = {
  receiptId: string;
  guardianPhone: string | null;
  /** Ouvert depuis « Imprimer » : la boîte d'impression s'ouvre d'elle-même. */
  autoPrint: boolean;
  backHref: string | null;
};

/** Barre d'actions du reçu (masquée à l'impression). */
export function ReceiptPrintControls({ receiptId, guardianPhone, autoPrint, backHref }: ReceiptPrintControlsProps) {
  const LABELS = useLabels();
  const L = LABELS.receipts;
  const started = useRef(false);

  const print = useCallback(() => {
    void markReceiptPrinted(receiptId);
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
      {backHref ? (
        <Button asChild variant="ghost" className="-ms-3 me-auto">
          <a href={backHref}>
            <ArrowLeft aria-hidden />
            {L.back}
          </a>
        </Button>
      ) : null}
      <Button type="button" onClick={print}>
        <Printer aria-hidden />
        {L.print}
      </Button>
      <ShareReceiptButton receiptId={receiptId} guardianPhone={guardianPhone} />
    </div>
  );
}
