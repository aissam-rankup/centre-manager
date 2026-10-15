import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { SalaryReceiptControls } from "@/components/salary-receipts/salary-receipt-controls";
import { SalaryReceiptDocument } from "@/components/salary-receipts/salary-receipt-document";
import { ROUTES } from "@/lib/auth/routes";
import { getCenterReceiptSettings } from "@/lib/data/receipts";
import { getSalaryReceipt } from "@/lib/data/salary-receipts";
import { getAppLocale } from "@/lib/i18n/request-locale";
import { getLabels } from "@/lib/i18n/server";

const PAGE_STYLES = {
  a5: "@page { size: A5 portrait; margin: 0; }",
  ticket_80mm: "@page { size: 80mm auto; margin: 0; }",
} as const;

export async function generateMetadata({ params }: PageProps<"/recus-paie/[id]">): Promise<Metadata> {
  const { id } = await params;
  const LABELS = await getLabels();
  const receipt = z.uuid().safeParse(id).success ? await getSalaryReceipt(id) : null;
  return { title: receipt ? LABELS.salaryReceipts.number(receipt.number) : LABELS.salaryReceipts.notFound };
}

/** Reçu de paie : consultation, impression (format des reçus du centre), WhatsApp, annulation. */
export default async function SalaryReceiptPage({ params, searchParams }: PageProps<"/recus-paie/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();

  const [receipt, settings, labels, locale] = await Promise.all([getSalaryReceipt(id), getCenterReceiptSettings(), getLabels(), getAppLocale()]);
  if (!receipt) notFound();

  return (
    <>
      <style>{`${PAGE_STYLES[settings.receiptFormat]} @media print { body { background: #fff !important; } }`}</style>
      <SalaryReceiptControls
        receiptId={receipt.id}
        receiptNumber={receipt.number}
        cancellable={receipt.kind === "payment" && receipt.cancelledBy === null}
        autoPrint={query.imprimer === "1"}
        backHref={ROUTES.admin.salaryReceipts}
      />
      <SalaryReceiptDocument receipt={receipt} format={settings.receiptFormat} labels={labels} locale={locale} />
    </>
  );
}
