"use server";

import { renderToBuffer } from "@react-pdf/renderer";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, failure, success } from "@/lib/actions/result";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole, requireStaff } from "@/lib/auth/session";
import { parseCents } from "@/lib/cash";
import { getCenterReceiptSettings, getReceipt } from "@/lib/data/receipts";
import { formatMAD } from "@/lib/format";
import { describeCenterError, getLabels } from "@/lib/i18n/server";
import { ReceiptPdf } from "@/lib/pdf/receipt-pdf";
import { isValidPhone, toWhatsAppHref } from "@/lib/phone";
import { PAYMENT_METHODS, RECEIPT_FORMATS, RECEIPT_LINK_DAYS, receiptPeriodLabel, renderReceiptMessage } from "@/lib/receipts";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const RECEIPTS_BUCKET = "receipts";

function revalidateStudents() {
  revalidatePath(ROUTES.admin.home, "layout");
  revalidatePath(ROUTES.assistant.home, "layout");
}

// ---------------------------------------------------------------------
// Encaissement : factures entières d'un élève, un reçu
// ---------------------------------------------------------------------
const paymentSchema = z.object({
  studentId: z.uuid(),
  invoiceIds: z.array(z.uuid()).min(1),
  method: z.enum(PAYMENT_METHODS),
  /** Premier encaissement du jour : fonds de caisse saisi (la caisse s'ouvre avec). */
  openingFloat: z.string().trim().optional(),
});

export async function recordPayment(
  input: unknown,
): Promise<ActionResult<{ receiptId: string; receiptNumber: string; amountPaid: number }>> {
  const LABELS = await getLabels();
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.payment.noneSelected);
  await requireStaff();
  const supabase = await createClient();

  if (parsed.data.openingFloat !== undefined) {
    const cents = parseCents(parsed.data.openingFloat === "" ? "0" : parsed.data.openingFloat);
    if (cents === null) return failure(LABELS.cash.amountInvalid, { openingFloat: LABELS.cash.amountInvalid });
    const { error: openError } = await supabase.rpc("open_cash_session", { p_opening_float: cents / 100 });
    if (openError) return failure(await describeCenterError(openError));
  }

  const { data, error } = await supabase.rpc("record_payment", {
      p_student_id: parsed.data.studentId,
      p_invoice_ids: parsed.data.invoiceIds,
      p_method: parsed.data.method,
    });
  if (error) return failure(error.code === "P0002" ? LABELS.payment.alreadyPaid : await describeCenterError(error));

  revalidateStudents();
  return success({ receiptId: data.id, receiptNumber: data.receipt_number ?? "", amountPaid: Number(data.amount_paid) });
}

// ---------------------------------------------------------------------
// Impression
// ---------------------------------------------------------------------
export async function markReceiptPrinted(receiptId: string): Promise<ActionResult> {
  const LABELS = await getLabels();
  if (!z.uuid().safeParse(receiptId).success) return failure(LABELS.actions.errors.invalid);
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_receipt_printed", { p_receipt_id: receiptId });
  if (error) return failure(await describeCenterError(error));
  revalidateStudents();
  return success();
}

// ---------------------------------------------------------------------
// Partage WhatsApp : PDF stocké, lien signé à durée limitée, message
// ---------------------------------------------------------------------
const shareSchema = z.object({ receiptId: z.uuid(), phone: z.string().trim().optional() });

export async function shareReceipt(input: unknown): Promise<ActionResult<{ href: string }>> {
  const LABELS = await getLabels();
  const S = LABELS.receipts.share;
  const parsed = shareSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid);
  const profile = await requireStaff();
  const supabase = await createClient();

  const receipt = await getReceipt(parsed.data.receiptId);
  if (!receipt) return failure(LABELS.receipts.notFound);

  // Numéro saisi pour cet envoi, sinon celui du responsable enregistré.
  let phone = parsed.data.phone || null;
  if (!phone && receipt.studentId) {
    const { data: student } = await supabase.from("students").select("guardian_phone").eq("id", receipt.studentId).maybeSingle();
    phone = student?.guardian_phone ?? null;
  }
  const whatsapp = phone && isValidPhone(phone) ? toWhatsAppHref(phone) : null;
  if (!whatsapp) return failure(S.phoneInvalid, { phone: S.phoneInvalid });

  // PDF déposé par le serveur (clé service_role, jamais exposée au client).
  const buffer = await renderToBuffer(ReceiptPdf({ receipt, labels: LABELS }));
  const path = `${profile.centerId}/${receipt.id}.pdf`;
  const storage = createAdminClient().storage.from(RECEIPTS_BUCKET);
  const { error: uploadError } = await storage.upload(path, new Uint8Array(buffer), {
    contentType: "application/pdf",
    upsert: true,
  });
  if (uploadError) return failure(LABELS.actions.errors.unexpected);
  const { data: signed, error: signError } = await storage.createSignedUrl(path, RECEIPT_LINK_DAYS * 24 * 60 * 60, {
    download: `recu-${receipt.number}.pdf`,
  });
  if (signError || !signed) return failure(LABELS.actions.errors.unexpected);

  const { error: traceError } = await supabase
    .from("receipts")
    .update({ pdf_url: path, whatsapp_sent_at: new Date().toISOString() })
    .eq("id", receipt.id);
  if (traceError) return failure(await describeCenterError(traceError));

  const settings = await getCenterReceiptSettings();
  const message = renderReceiptMessage(
    settings.whatsappTemplate,
    {
      student: receipt.studentName,
      period: receiptPeriodLabel(receipt.lines),
      amount: formatMAD(receipt.amountPaid),
      center: receipt.center.name,
      link: signed.signedUrl,
      number: receipt.number,
    },
    LABELS,
  );

  revalidateStudents();
  return success({ href: `${whatsapp}?text=${encodeURIComponent(message)}` });
}

// ---------------------------------------------------------------------
// Annulation (admin) : reçu d'annulation lié
// ---------------------------------------------------------------------
const cancelSchema = z.object({ receiptId: z.uuid(), reason: z.string().trim().min(1).max(300) });

export async function cancelReceipt(input: unknown): Promise<ActionResult<{ receiptId: string }>> {
  const LABELS = await getLabels();
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) {
    return failure(LABELS.receipts.cancel.reasonRequired, { reason: LABELS.receipts.cancel.reasonRequired });
  }
  await requireRole("admin");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_receipt", { p_receipt_id: parsed.data.receiptId, p_reason: parsed.data.reason });
  if (error) return failure(await describeCenterError(error));

  revalidateStudents();
  return success({ receiptId: data.id });
}

// ---------------------------------------------------------------------
// Réglages du centre (admin)
// ---------------------------------------------------------------------
export async function updateCenterSettings(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const C = LABELS.centerSettings;
  const schema = z.object({
    address: z.string().trim().max(200, C.addressTooLong),
    phone: z
      .string()
      .trim()
      .refine((value) => value === "" || isValidPhone(value), C.phoneInvalid),
    receiptFormat: z.enum(RECEIPT_FORMATS),
    whatsappTemplate: z
      .string()
      .trim()
      .max(1000, C.templateTooLong)
      .refine((value) => value === "" || value.includes(LABELS.receipts.tokens.link), C.templateNeedsLink),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return failure(LABELS.actions.errors.invalid, fieldErrors);
  }
  const profile = await requireRole("admin");
  const supabase = await createClient();

  const template = parsed.data.whatsappTemplate;
  const { error } = await supabase
    .from("centers")
    .update({
      address: parsed.data.address || null,
      phone: parsed.data.phone || null,
      receipt_format: parsed.data.receiptFormat,
      // Message identique au modèle proposé : rien d'enregistré (il suit les mises à jour).
      receipt_whatsapp_template: template && template !== LABELS.receipts.whatsappTemplate ? template : null,
    })
    .eq("id", profile.centerId);
  if (error) return failure(await describeCenterError(error));

  revalidatePath(ROUTES.admin.home, "layout");
  return success();
}
