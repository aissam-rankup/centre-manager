import { Eye, Printer, ReceiptText } from "lucide-react";

import { CancelReceiptButton } from "@/components/receipts/cancel-receipt-button";
import { ShareReceiptButton } from "@/components/receipts/share-receipt-button";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/auth/routes";
import { formatDateTime, formatMAD } from "@/lib/format";
import { getLabels } from "@/lib/i18n/server";
import { receiptPeriodLabel, type ReceiptView } from "@/lib/receipts";
import { cn } from "@/lib/utils";

type ReceiptsSectionProps = {
  receipts: ReceiptView[];
  guardianPhone: string | null;
  /** Admin : émettre un reçu d'annulation. */
  canCancel: boolean;
};

/** Historique des reçus de l'élève : consulter, réimprimer, renvoyer, annuler. */
export async function ReceiptsSection({ receipts, guardianPhone, canCancel }: ReceiptsSectionProps) {
  const LABELS = await getLabels();
  const L = LABELS.receipts;

  return (
    <SectionCard id="recus" title={L.sectionTitle} description={L.sectionDescription}>
      {receipts.length === 0 ? (
        <EmptyState icon={ReceiptText} title={L.emptyTitle} description={L.emptyDescription} className="py-8 shadow-none" />
      ) : (
        <ul className="flex flex-col divide-y">
          {receipts.map((receipt) => {
            const cancellation = receipt.kind === "cancellation";
            const traces = [
              receipt.printedAt ? L.printed(formatDateTime(receipt.printedAt)) : null,
              receipt.whatsappSentAt ? L.sent(formatDateTime(receipt.whatsappSentAt)) : null,
            ].filter(Boolean);
            return (
              <li key={receipt.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="numeric font-semibold">
                      {cancellation ? L.cancellationNumber(receipt.number) : L.number(receipt.number)}
                    </span>
                    {receipt.cancelledBy ? (
                      <span className="rounded-full bg-danger/10 px-2 py-0.5 text-caption font-medium text-danger-ink">{L.cancelled}</span>
                    ) : null}
                    {cancellation ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-caption font-medium text-muted-foreground">
                        {L.cancellation}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-caption text-muted-foreground">
                    {formatDateTime(receipt.issuedAt)} · {receiptPeriodLabel(receipt.lines)} · {LABELS.paymentMethods[receipt.method]}
                    {receipt.issuedByName ? ` · ${receipt.issuedByName}` : ""}
                  </span>
                  {cancellation && receipt.cancelsNumber ? (
                    <span className="text-caption text-muted-foreground">
                      {L.cancels(receipt.cancelsNumber)}
                      {receipt.cancelReason ? ` — ${receipt.cancelReason}` : ""}
                    </span>
                  ) : null}
                  {traces.length > 0 ? <span className="text-caption text-success-ink">{traces.join(" · ")}</span> : null}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <span className={cn("numeric mr-2 font-semibold", cancellation && "text-danger-ink")}>
                    {formatMAD(receipt.amountPaid)}
                  </span>
                  <Button asChild variant="outline">
                    <a href={ROUTES.receipt(receipt.id)}>
                      <Eye aria-hidden />
                      {L.view}
                    </a>
                  </Button>
                  <Button asChild variant="outline">
                    <a href={`${ROUTES.receipt(receipt.id)}?imprimer=1`} target="_blank" rel="noopener">
                      <Printer aria-hidden />
                      {receipt.printedAt ? L.printAgain : L.print}
                    </a>
                  </Button>
                  <ShareReceiptButton
                    receiptId={receipt.id}
                    guardianPhone={guardianPhone}
                    label={receipt.whatsappSentAt ? L.whatsappAgain : L.whatsapp}
                  />
                  {canCancel && !cancellation && !receipt.cancelledBy ? (
                    <CancelReceiptButton receiptId={receipt.id} receiptNumber={receipt.number} />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
