import { type AppLabels, labelsFor } from "@/lib/constants/labels";
import type { Locale } from "@/lib/i18n/locale";
import { type DiscountSummary, parseDiscountSummary } from "@/lib/discounts";
import { formatMonth } from "@/lib/format";
import type { Database, Json } from "@/lib/supabase/database.types";
import { fillTemplate } from "@/lib/templates";

export type PaymentMethod = Database["public"]["Enums"]["payment_method"];
export type ReceiptFormat = Database["public"]["Enums"]["receipt_format"];

export const PAYMENT_METHODS = ["cash", "bank_transfer", "card", "cheque"] as const satisfies readonly PaymentMethod[];
export const RECEIPT_FORMATS = ["a5", "ticket_80mm"] as const satisfies readonly ReceiptFormat[];

/** Durée de validité du lien de reçu envoyé sur WhatsApp. */
export const RECEIPT_LINK_DAYS = 7;

export type ReceiptLine = {
  invoiceId: string;
  subject: string;
  level: string | null;
  pack: boolean;
  periodStart: string;
  periodEnd: string;
  amountFull: number;
  discountAmount: number;
  discount: DiscountSummary | null;
  amountPaid: number;
};

/** En-tête du reçu, figé à l'émission : marque du client en marque blanche. */
export type ReceiptCenter = {
  name: string;
  address: string | null;
  phone: string | null;
  logoUrl: string | null;
  color: string | null;
  /** Centre en marque blanche à l'émission : aucune mention dirassty sur le reçu. */
  whiteLabel: boolean;
};

export type ReceiptView = {
  id: string;
  number: string;
  kind: "payment" | "cancellation";
  issuedAt: string;
  studentId: string | null;
  studentName: string;
  levelName: string | null;
  lines: ReceiptLine[];
  amountFull: number;
  discountApplied: number;
  amountPaid: number;
  method: PaymentMethod;
  balanceDue: number;
  issuedByName: string | null;
  center: ReceiptCenter;
  cancelsNumber: string | null;
  cancelReason: string | null;
  /** Reçu d'annulation émis pour ce reçu. */
  cancelledBy: { number: string; issuedAt: string } | null;
  printedAt: string | null;
  whatsappSentAt: string | null;
};

function isRecord(value: Json | undefined): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const text = (value: Json | undefined): string | null => (typeof value === "string" && value.length > 0 ? value : null);

export function parseReceiptLines(value: Json): ReceiptLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    return [
      {
        invoiceId: text(item.invoice_id) ?? "",
        subject: text(item.subject) ?? "",
        level: text(item.level),
        pack: item.pack === true,
        periodStart: text(item.period_start) ?? "",
        periodEnd: text(item.period_end) ?? "",
        amountFull: Number(item.amount_full ?? 0),
        discountAmount: Number(item.discount_amount ?? 0),
        discount: parseDiscountSummary(item.discount),
        amountPaid: Number(item.amount_paid ?? 0),
      },
    ];
  });
}

/** Coordonnées figées : nom de marque (marque blanche) sinon nom du centre. */
export function parseReceiptCenter(value: Json): ReceiptCenter {
  if (!isRecord(value)) return { name: "", address: null, phone: null, logoUrl: null, color: null, whiteLabel: false };
  const branding = isRecord(value.branding) ? value.branding : null;
  return {
    name: text(branding?.brand_name) ?? text(value.name) ?? "",
    address: text(value.address),
    phone: text(value.phone) ?? text(branding?.support_phone),
    logoUrl: text(branding?.logo_url),
    color: text(branding?.primary_color),
    whiteLabel: branding !== null,
  };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Période couverte : « Octobre 2026 », ou « Septembre 2026 – Octobre 2026 ». */
/** Période couverte ; en français par défaut (reçu remis aux familles). */
export function receiptPeriodLabel(lines: Pick<ReceiptLine, "periodStart">[], locale: Locale = "fr"): string {
  const months = [...new Set(lines.map((line) => line.periodStart.slice(0, 7)))].sort();
  if (months.length === 0) return "";
  const first = capitalize(formatMonth(`${months[0]}-01`, locale));
  if (months.length === 1) return first;
  return `${first} – ${capitalize(formatMonth(`${months[months.length - 1]}-01`, locale))}`;
}

export type ReceiptMessageValues = {
  student: string;
  period: string;
  amount: string;
  center: string;
  link: string;
  number: string;
};

/** Message WhatsApp : modèle du centre (ou proposé), variables remplacées. */
export function renderReceiptMessage(template: string | null, values: ReceiptMessageValues, LABELS: AppLabels): string {
  const message = template?.trim() ? template : LABELS.receipts.whatsappTemplate;
  return fillTemplate(message, LABELS.receipts.tokens, labelsFor().receipts.tokens, values);
}
