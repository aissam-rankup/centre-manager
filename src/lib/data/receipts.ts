import "server-only";

import { requireRole, requireStaff } from "@/lib/auth/session";
import { labelsFor } from "@/lib/constants/labels";
import { getLabels } from "@/lib/i18n/server";
import {
  type PaymentMethod,
  parseReceiptCenter,
  parseReceiptLines,
  type ReceiptFormat,
  type ReceiptView,
} from "@/lib/receipts";
import { createClient } from "@/lib/supabase/server";
import { fromCanonicalTokens } from "@/lib/templates";

const RECEIPT_COLUMNS =
  "id, receipt_number, kind, issued_at, student_id, student_name, level_name, subjects_covered, amount_full, discount_applied, amount_paid, payment_method, balance_due, issued_by_name, center_snapshot, cancels_receipt_id, cancel_reason, printed_at, whatsapp_sent_at";

type ReceiptRow = {
  id: string;
  receipt_number: string | null;
  kind: "payment" | "cancellation";
  issued_at: string;
  student_id: string | null;
  student_name: string;
  level_name: string | null;
  subjects_covered: Parameters<typeof parseReceiptLines>[0];
  amount_full: number;
  discount_applied: number;
  amount_paid: number;
  payment_method: PaymentMethod;
  balance_due: number;
  issued_by_name: string | null;
  center_snapshot: Parameters<typeof parseReceiptCenter>[0];
  cancels_receipt_id: string | null;
  cancel_reason: string | null;
  printed_at: string | null;
  whatsapp_sent_at: string | null;
};

function toView(
  row: ReceiptRow,
  numbers: Map<string, string>,
  cancellations: Map<string, { number: string; issuedAt: string }>,
): ReceiptView {
  return {
    id: row.id,
    number: row.receipt_number ?? "",
    kind: row.kind,
    issuedAt: row.issued_at,
    studentId: row.student_id,
    studentName: row.student_name,
    levelName: row.level_name,
    lines: parseReceiptLines(row.subjects_covered),
    amountFull: Number(row.amount_full),
    discountApplied: Number(row.discount_applied),
    amountPaid: Number(row.amount_paid),
    method: row.payment_method,
    balanceDue: Number(row.balance_due),
    issuedByName: row.issued_by_name,
    center: parseReceiptCenter(row.center_snapshot),
    cancelsNumber: row.cancels_receipt_id ? (numbers.get(row.cancels_receipt_id) ?? null) : null,
    cancelReason: row.cancel_reason,
    cancelledBy: cancellations.get(row.id) ?? null,
    printedAt: row.printed_at,
    whatsappSentAt: row.whatsapp_sent_at,
  };
}

/** Un reçu (RLS : admin et accueil du centre). */
export async function getReceipt(id: string): Promise<ReceiptView | null> {
  await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase.from("receipts").select(RECEIPT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const [original, cancellation] = await Promise.all([
    data.cancels_receipt_id
      ? supabase.from("receipts").select("id, receipt_number").eq("id", data.cancels_receipt_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("receipts").select("receipt_number, issued_at").eq("cancels_receipt_id", id).maybeSingle(),
  ]);
  if (original.error) throw original.error;
  if (cancellation.error) throw cancellation.error;

  const numbers = new Map(original.data ? [[original.data.id, original.data.receipt_number ?? ""] as const] : []);
  const cancellations = new Map(
    cancellation.data ? [[id, { number: cancellation.data.receipt_number ?? "", issuedAt: cancellation.data.issued_at }] as const] : [],
  );
  return toView(data, numbers, cancellations);
}

/** Reçus d'un élève, du plus récent au plus ancien. */
export async function getStudentReceipts(studentId: string): Promise<ReceiptView[]> {
  const profile = await requireStaff();
  if (!profile.modules.includes("finance")) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("receipts")
    .select(RECEIPT_COLUMNS)
    .eq("student_id", studentId)
    .order("issued_at", { ascending: false })
    .order("receipt_number", { ascending: false });
  if (error) throw error;

  const numbers = new Map(data.map((row) => [row.id, row.receipt_number ?? ""] as const));
  const cancellations = new Map(
    data.flatMap((row) =>
      row.cancels_receipt_id ? [[row.cancels_receipt_id, { number: row.receipt_number ?? "", issuedAt: row.issued_at }] as const] : [],
    ),
  );
  return data.map((row) => toView(row, numbers, cancellations));
}

export type CenterReceiptSettings = {
  address: string | null;
  phone: string | null;
  receiptFormat: ReceiptFormat;
  whatsappTemplate: string | null;
};

/** Réglages des reçus du centre connecté. */
export async function getCenterReceiptSettings(): Promise<CenterReceiptSettings> {
  const profile = await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("centers")
    .select("address, phone, receipt_format, receipt_whatsapp_template")
    .eq("id", profile.centerId)
    .single();
  if (error) throw error;
  // Modèle enregistré avec les variables d'origine : affiché dans le vocabulaire du centre.
  const template = data.receipt_whatsapp_template;
  return {
    address: data.address,
    phone: data.phone,
    receiptFormat: data.receipt_format,
    whatsappTemplate: template ? fromCanonicalTokens(template, (await getLabels()).receipts.tokens, labelsFor().receipts.tokens) : null,
  };
}

/** Réglages modifiables : admin uniquement. */
export async function getEditableCenterSettings(): Promise<CenterReceiptSettings> {
  await requireRole("admin");
  return getCenterReceiptSettings();
}
