import type { AppLabels } from "@/lib/constants/labels";
import { discountBadgeLabel } from "@/lib/discounts";
import { formatDate, formatDateTime, formatMAD } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { type ReceiptFormat, receiptPeriodLabel, type ReceiptView } from "@/lib/receipts";
import { cn } from "@/lib/utils";

type ReceiptDocumentProps = { receipt: ReceiptView; format: ReceiptFormat; labels: AppLabels };

/**
 * Reçu imprimable : A5 portrait ou ticket 80 mm. Couleurs fixes (papier),
 * indépendantes du thème de l'application ; marque figée à l'émission.
 */
export function ReceiptDocument({ receipt, format, labels }: ReceiptDocumentProps) {
  const L = labels.receipts;
  const ticket = format === "ticket_80mm";
  const cancellation = receipt.kind === "cancellation";
  const color = receipt.center.color ?? "#6c2bf5";
  const phone = receipt.center.phone ? L.phone(formatPhone(receipt.center.phone)) : null;

  return (
    <article
      className={cn(
        "receipt-paper mx-auto bg-white text-[#2b2f45] shadow-card print:shadow-none",
        ticket ? "w-[80mm] px-[4mm] py-[5mm] text-[11px]" : "w-full max-w-[148mm] px-[10mm] py-[9mm] text-[12.5px]",
      )}
    >
      <header
        className={cn("flex gap-3 border-b-2 pb-3", ticket ? "flex-col items-center text-center" : "items-center")}
        style={{ borderColor: color }}
      >
        {receipt.center.logoUrl ? (
          // Logo du client (bucket public de la marque) : taille fixe, aucune optimisation nécessaire.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={receipt.center.logoUrl} alt="" className={cn("object-contain", ticket ? "size-10" : "size-12")} />
        ) : null}
        <div className="flex min-w-0 flex-col">
          <p className={cn("font-bold", ticket ? "text-[14px]" : "text-[17px]")} style={{ color }}>
            {receipt.center.name}
          </p>
          {receipt.center.address ? <p className="text-[#6b7088]">{receipt.center.address}</p> : null}
          {phone ? <p className="text-[#6b7088]">{phone}</p> : null}
        </div>
      </header>

      <div className={cn("mt-3 flex gap-2", ticket ? "flex-col text-center" : "items-start justify-between")}>
        <div>
          <h1 className={cn("font-bold", ticket ? "text-[14px]" : "text-[18px]")}>{cancellation ? L.cancellationTitle : L.title}</h1>
          <p className="text-[#6b7088]">{L.issuedAt(formatDateTime(receipt.issuedAt))}</p>
        </div>
        <p className="font-bold whitespace-nowrap tabular-nums">
          {cancellation ? L.cancellationNumber(receipt.number) : L.number(receipt.number)}
        </p>
      </div>

      <dl className={cn("mt-3 grid gap-2", ticket ? "grid-cols-1" : "grid-cols-2")}>
        <div>
          <dt className="text-[10px] tracking-wide text-[#6b7088] uppercase">{L.student}</dt>
          <dd className="font-semibold">{receipt.studentName}</dd>
          {receipt.levelName ? <dd className="text-[#6b7088]">{receipt.levelName}</dd> : null}
        </div>
        <div>
          <dt className="text-[10px] tracking-wide text-[#6b7088] uppercase">{L.period}</dt>
          <dd className="font-semibold">{receiptPeriodLabel(receipt.lines)}</dd>
        </div>
      </dl>

      {cancellation && receipt.cancelsNumber ? (
        <p className="mt-3 rounded bg-[#f5f6fa] px-3 py-2">
          {L.cancels(receipt.cancelsNumber)}
          {receipt.cancelReason ? ` — ${L.cancelReason} : ${receipt.cancelReason}` : ""}
        </p>
      ) : null}

      <ul className="mt-3 border-t border-[#e4e6ef]">
        {receipt.lines.map((line) => (
          <li key={line.invoiceId} className="border-b border-[#e4e6ef] py-2 break-inside-avoid">
            <div className="flex justify-between gap-3 font-semibold">
              <span>{line.subject}</span>
              <span className="tabular-nums whitespace-nowrap">{formatMAD(line.amountPaid)}</span>
            </div>
            <p className="text-[#6b7088]">{L.linePeriod(formatDate(line.periodStart), formatDate(line.periodEnd))}</p>
            {line.discountAmount > 0 ? (
              <div className="flex justify-between gap-3 text-[#6b7088]">
                <span>
                  {L.rate} <s className="tabular-nums">{formatMAD(line.amountFull)}</s>
                  {line.discount ? ` · ${discountBadgeLabel(line.discount, labels)}` : ""}
                </span>
                <span className="tabular-nums whitespace-nowrap">− {formatMAD(line.discountAmount)}</span>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <dl className="mt-3 flex flex-col gap-1">
        {receipt.discountApplied !== 0 ? (
          <>
            <Row label={L.totalFull} value={formatMAD(receipt.amountFull)} />
            <Row label={L.totalDiscount} value={`− ${formatMAD(Math.abs(receipt.discountApplied))}`} />
          </>
        ) : null}
        <div className={cn("mt-1 flex justify-between border-t-2 border-[#2b2f45] pt-2 font-bold", ticket ? "text-[14px]" : "text-[17px]")}>
          <dt>{cancellation ? L.totalCancelled : L.total}</dt>
          <dd className="tabular-nums" style={{ color }}>
            {formatMAD(receipt.amountPaid)}
          </dd>
        </div>
        <Row label={L.method} value={labels.paymentMethods[receipt.method]} />
        {!cancellation ? (
          <Row label={L.balanceDue} value={receipt.balanceDue > 0 ? formatMAD(receipt.balanceDue) : L.nothingDue} strong={receipt.balanceDue > 0} />
        ) : null}
        {receipt.issuedByName ? <Row label={cancellation ? L.cancelledBy : L.cashier} value={receipt.issuedByName} /> : null}
      </dl>

      {receipt.cancelledBy ? (
        <p className="mt-3 rounded bg-[#fdecea] px-3 py-2 font-semibold text-[#b42318]">
          {L.cancelledNotice(receipt.cancelledBy.number, formatDate(receipt.cancelledBy.issuedAt))}
        </p>
      ) : null}

      <footer className="mt-5 border-t border-[#e4e6ef] pt-3 text-center text-[#6b7088]">
        <p className="font-semibold text-[#2b2f45]">{L.thanks}</p>
        <p>{receipt.center.name}</p>
        {[receipt.center.address, phone].filter(Boolean).length > 0 ? (
          <p>{[receipt.center.address, phone].filter(Boolean).join(" · ")}</p>
        ) : null}
      </footer>
    </article>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[#6b7088]">{label}</dt>
      <dd className={cn("text-right tabular-nums", strong && "font-bold")}>{value}</dd>
    </div>
  );
}
