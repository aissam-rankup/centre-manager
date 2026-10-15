"use server";

import { renderToBuffer } from "@react-pdf/renderer";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, failure, success } from "@/lib/actions/result";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole } from "@/lib/auth/session";
import { getSalaryReceipt } from "@/lib/data/salary-receipts";
import { formatMAD } from "@/lib/format";
import { getAppLocale } from "@/lib/i18n/request-locale";
import { describeCenterError, getLabels } from "@/lib/i18n/server";
import { SalaryReceiptPdf } from "@/lib/pdf/salary-receipt-pdf";
import { SALARY_RECEIPT_LINK_DAYS, salaryReceiptMessage } from "@/lib/salary-receipts";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const SALARY_RECEIPTS_BUCKET = "salary-receipts";

function revalidateSalaryReceipts() {
  revalidatePath(ROUTES.admin.payroll, "layout");
}

/** Admin du centre, hors mode support (les reçus de paie n'y sont pas consultables). */
async function financeAdmin() {
  const profile = await requireRole("admin");
  return profile.support ? null : profile;
}

export async function markSalaryReceiptPrinted(receiptId: string): Promise<ActionResult> {
  const LABELS = await getLabels();
  if (!z.uuid().safeParse(receiptId).success) return failure(LABELS.actions.errors.invalid);
  if (!(await financeAdmin())) return failure(LABELS.actions.errors.forbidden);
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_salary_receipt_printed", { p_payment_id: receiptId });
  if (error) return failure(await describeCenterError(error));
  revalidateSalaryReceipts();
  return success();
}

/**
 * Partage WhatsApp : le serveur dépose le PDF (clé service_role, bucket privé),
 * signe un lien à durée limitée et propose le message, que l'admin peut modifier
 * avant d'ouvrir WhatsApp.
 */
export async function prepareSalaryReceiptShare(receiptId: string): Promise<ActionResult<{ message: string; phone: string | null }>> {
  const LABELS = await getLabels();
  if (!z.uuid().safeParse(receiptId).success) return failure(LABELS.actions.errors.invalid);
  const profile = await financeAdmin();
  if (!profile) return failure(LABELS.actions.errors.forbidden);

  const receipt = await getSalaryReceipt(receiptId);
  if (!receipt) return failure(LABELS.salaryReceipts.notFound);

  const locale = await getAppLocale();
  const buffer = await renderToBuffer(SalaryReceiptPdf({ receipt, labels: LABELS, locale }));
  const path = `${profile.centerId}/${receipt.id}.pdf`;
  const storage = createAdminClient().storage.from(SALARY_RECEIPTS_BUCKET);
  const { error: uploadError } = await storage.upload(path, new Uint8Array(buffer), { contentType: "application/pdf", upsert: true });
  if (uploadError) return failure(LABELS.actions.errors.unexpected);
  const { data: signed, error: signError } = await storage.createSignedUrl(path, SALARY_RECEIPT_LINK_DAYS * 24 * 60 * 60, {
    download: `recu-de-paie-${receipt.number}.pdf`,
  });
  if (signError || !signed) return failure(LABELS.actions.errors.unexpected);

  const supabase = await createClient();
  const { error: traceError } = await supabase
    .from("salary_payments")
    .update({ pdf_url: path, whatsapp_sent_at: new Date().toISOString() })
    .eq("id", receipt.id);
  if (traceError) return failure(await describeCenterError(traceError));

  revalidateSalaryReceipts();
  return success({
    message: salaryReceiptMessage(receipt, formatMAD(Math.abs(receipt.amount), locale), signed.signedUrl, LABELS, locale),
    phone: receipt.memberPhone,
  });
}

const cancelSchema = z.object({ receiptId: z.uuid(), reason: z.string().trim().min(1).max(300) });

/** Annulation (admin) : reçu d'annulation lié ; la ligne de paie redevient à verser. */
export async function cancelSalaryReceipt(input: unknown): Promise<ActionResult<{ receiptId: string }>> {
  const LABELS = await getLabels();
  const C = LABELS.salaryReceipts.cancel;
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return failure(C.reasonRequired, { reason: C.reasonRequired });
  if (!(await financeAdmin())) return failure(LABELS.actions.errors.forbidden);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_salary_payment", { p_payment_id: parsed.data.receiptId, p_reason: parsed.data.reason });
  if (error) return failure(await describeCenterError(error));
  revalidateSalaryReceipts();
  revalidatePath(ROUTES.admin.home);
  return success({ receiptId: data.id });
}
