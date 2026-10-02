import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ReceiptDocument } from "@/components/receipts/receipt-document";
import { ReceiptPrintControls } from "@/components/receipts/receipt-print-controls";
import { ROUTES } from "@/lib/auth/routes";
import { requireStaff } from "@/lib/auth/session";
import { getCenterReceiptSettings, getReceipt } from "@/lib/data/receipts";
import { getLabels } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

const PAGE_STYLES = {
  a5: "@page { size: A5 portrait; margin: 0; }",
  ticket_80mm: "@page { size: 80mm auto; margin: 0; }",
} as const;

export async function generateMetadata({ params }: PageProps<"/recus/[id]">): Promise<Metadata> {
  const { id } = await params;
  const LABELS = await getLabels();
  const receipt = z.uuid().safeParse(id).success ? await getReceipt(id) : null;
  return { title: receipt ? LABELS.receipts.number(receipt.number) : LABELS.receipts.notFound };
}

export default async function ReceiptPage({ params, searchParams }: PageProps<"/recus/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();

  const profile = await requireStaff();
  const [receipt, settings, LABELS] = await Promise.all([getReceipt(id), getCenterReceiptSettings(), getLabels()]);
  if (!receipt) notFound();

  let guardianPhone: string | null = null;
  if (receipt.studentId) {
    const supabase = await createClient();
    const { data } = await supabase.from("students").select("guardian_phone").eq("id", receipt.studentId).maybeSingle();
    guardianPhone = data?.guardian_phone ?? null;
  }

  const studentsRoute = profile.role === "admin" ? ROUTES.admin.students : ROUTES.assistant.students;
  const backHref = receipt.studentId ? `${studentsRoute}/${receipt.studentId}?onglet=recus` : null;

  return (
    <>
      <style>{`${PAGE_STYLES[settings.receiptFormat]} @media print { body { background: #fff !important; } }`}</style>
      <ReceiptPrintControls
        receiptId={receipt.id}
        guardianPhone={guardianPhone}
        autoPrint={query.imprimer === "1"}
        backHref={backHref}
      />
      <ReceiptDocument receipt={receipt} format={settings.receiptFormat} labels={LABELS} />
    </>
  );
}
