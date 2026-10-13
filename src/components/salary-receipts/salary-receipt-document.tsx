import { Logo } from "@/components/brand/logo";
import { amountInWords } from "@/lib/amount-words";
import type { AppLabels } from "@/lib/constants/labels";
import { formatDate, formatDateTime, formatMAD } from "@/lib/format";
import { dirFor, type Locale } from "@/lib/i18n/locale";
import { formatPhone } from "@/lib/phone";
import type { ReceiptFormat } from "@/lib/receipts";
import { salaryPeriodLabel, type SalaryReceiptView } from "@/lib/salary-receipts";
import { cn } from "@/lib/utils";

/** Valeur écrite de gauche à droite (téléphone, numéro, adresse) isolée du sens de la phrase. */
const ltr = (value: string) => `⁦${value}⁩`;

type SalaryReceiptDocumentProps = {
  receipt: SalaryReceiptView;
  format: ReceiptFormat;
  labels: AppLabels;
  locale?: Locale;
};

/**
 * Reçu de paie imprimable : même gabarit que les reçus des élèves (A5 portrait
 * ou ticket 80 mm, couleurs fixes de papier, marque figée à l'émission).
 */
export function SalaryReceiptDocument({ receipt, format, labels, locale = "fr" }: SalaryReceiptDocumentProps) {
  const L = labels.salaryReceipts;
  const ticket = format === "ticket_80mm";
  const cancellation = receipt.kind === "cancellation";
  const color = receipt.center.color ?? "#6c2bf5";
  const phone = receipt.center.phone ? labels.receipts.phone(ltr(formatPhone(receipt.center.phone))) : null;
  const address = receipt.center.address ? ltr(receipt.center.address) : null;

  return (
    <article
      lang={locale}
      dir={dirFor(locale)}
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
        ) : receipt.center.whiteLabel ? null : (
          <Logo variant="mark" tone="mono" height={ticket ? 40 : 48} priority />
        )}
        <div className="flex min-w-0 flex-col">
          <p className={cn("font-bold", ticket ? "text-[14px]" : "text-[17px]")} style={{ color }}>
            {receipt.center.name}
          </p>
          {address ? <p className="text-[#6b7088]">{address}</p> : null}
          {phone ? <p className="text-[#6b7088]">{phone}</p> : null}
        </div>
      </header>

      <div className={cn("mt-3 flex gap-2", ticket ? "flex-col text-center" : "items-start justify-between")}>
        <div>
          <h1 className={cn("font-bold", ticket ? "text-[14px]" : "text-[18px]")}>{cancellation ? L.cancellationTitle : L.title}</h1>
          <p className="text-[#6b7088]">{L.issuedAt(formatDateTime(receipt.issuedAt))}</p>
        </div>
        <p className="font-bold whitespace-nowrap tabular-nums">
          {cancellation ? L.cancellationNumber(ltr(receipt.number)) : L.number(ltr(receipt.number))}
        </p>
      </div>

      <dl className={cn("mt-3 grid gap-2", ticket ? "grid-cols-1" : "grid-cols-2")}>
        <div>
          <dt className="text-[10px] tracking-wide text-[#6b7088] uppercase">{L.member}</dt>
          <dd className="font-semibold">{receipt.memberName}</dd>
          <dd className="text-[#6b7088]">{labels.roles[receipt.memberRole]}</dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-wide text-[#6b7088] uppercase">{L.period}</dt>
          <dd className="font-semibold">{salaryPeriodLabel(receipt.period, locale)}</dd>
        </div>
      </dl>

      {cancellation && receipt.cancelsNumber ? (
        <p className="mt-3 rounded bg-[#f5f6fa] px-3 py-2">
          {L.cancels(receipt.cancelsNumber)}
          {receipt.cancelReason ? ` — ${L.cancelReason} : ${receipt.cancelReason}` : ""}
        </p>
      ) : null}

      <dl className="mt-3 flex flex-col gap-1">
        <div className={cn("flex justify-between border-t-2 border-[#2b2f45] pt-2 font-bold", ticket ? "text-[14px]" : "text-[17px]")}>
          <dt>{cancellation ? L.amountCancelled : L.amount}</dt>
          <dd className="tabular-nums" style={{ color }}>
            {formatMAD(receipt.amount, locale)}
          </dd>
        </div>
        <div className="rounded bg-[#f5f6fa] px-3 py-2">
          <dt className="text-[10px] tracking-wide text-[#6b7088] uppercase">{L.amountInWords}</dt>
          <dd className="font-semibold">{amountInWords(receipt.amount, locale)}</dd>
        </div>
        <Row label={L.paidOn} value={formatDate(receipt.paidOn)} />
        <Row label={L.method} value={labels.paymentMethods[receipt.method]} />
        {receipt.note ? <Row label={L.note} value={receipt.note} /> : null}
        {receipt.issuedByName ? <Row label={cancellation ? L.cancelledBy : L.issuedBy} value={receipt.issuedByName} /> : null}
      </dl>

      {receipt.cancelledBy ? (
        <p className="mt-3 rounded bg-[#fdecea] px-3 py-2 font-semibold text-[#b42318]">
          {L.cancelledNotice(receipt.cancelledBy.number, formatDate(receipt.cancelledBy.issuedAt))}
        </p>
      ) : null}

      {!cancellation ? (
        <div className={cn("mt-8 grid gap-6 text-center text-[#6b7088]", ticket ? "grid-cols-1" : "grid-cols-2")}>
          <p className="border-t border-[#8a90a6] pt-1">{L.signatureMember}</p>
          <p className="border-t border-[#8a90a6] pt-1">{L.signatureCenter}</p>
        </div>
      ) : null}

      <footer className="mt-5 border-t border-[#e4e6ef] pt-3 text-center text-[#6b7088]">
        <p>{receipt.center.name}</p>
        {[address, phone].filter(Boolean).length > 0 ? <p>{[address, phone].filter(Boolean).join(" · ")}</p> : null}
        {receipt.center.whiteLabel ? null : (
          <p className="mt-2 flex items-center justify-center gap-1.5 text-[10px] text-[#8a90a6]">
            <Logo variant="mark" tone="mono" height={10} priority decorative />
            {labels.receipts.editedWith}
          </p>
        )}
      </footer>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[#6b7088]">{label}</dt>
      <dd className="text-end">{value}</dd>
    </div>
  );
}
