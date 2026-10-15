import type { AppLabels } from "@/lib/constants/labels";
import { formatMonth } from "@/lib/format";
import type { Locale } from "@/lib/i18n/locale";
import { monthKey, type PayrollMonth } from "@/lib/payroll";
import { type PaymentMethod, parseReceiptCenter, type ReceiptCenter } from "@/lib/receipts";
import type { Database } from "@/lib/supabase/database.types";

type UserRole = Database["public"]["Enums"]["user_role"];
export type SalaryPaymentRow = Database["public"]["Tables"]["salary_payments"]["Row"];

/** Durée de validité du lien envoyé sur WhatsApp (comme les reçus des élèves). */
export const SALARY_RECEIPT_LINK_DAYS = 7;

/** Reçu de paie : tout ce qu'il affiche est figé à l'émission. */
export type SalaryReceiptView = {
  id: string;
  number: string;
  kind: "payment" | "cancellation";
  issuedAt: string;
  paidOn: string;
  period: PayrollMonth;
  amount: number;
  method: PaymentMethod;
  note: string | null;
  memberId: string | null;
  memberName: string;
  memberRole: UserRole;
  memberPhone: string | null;
  issuedByName: string | null;
  center: ReceiptCenter;
  cancelsNumber: string | null;
  cancelReason: string | null;
  /** Reçu d'annulation émis pour ce reçu. */
  cancelledBy: { id: string; number: string; issuedAt: string } | null;
  printedAt: string | null;
  whatsappSentAt: string | null;
};

export function toSalaryReceiptView(
  row: SalaryPaymentRow,
  links: { cancelsNumber: string | null; cancelledBy: SalaryReceiptView["cancelledBy"] },
): SalaryReceiptView {
  return {
    id: row.id,
    number: row.receipt_number ?? "",
    kind: row.kind,
    issuedAt: row.issued_at,
    paidOn: row.paid_on,
    period: { year: row.period_year, month: row.period_month },
    amount: Number(row.amount),
    method: row.payment_method,
    note: row.note,
    memberId: row.member_id,
    memberName: row.member_name,
    memberRole: row.member_role,
    memberPhone: row.member_phone,
    issuedByName: row.issued_by_name,
    center: parseReceiptCenter(row.center_snapshot),
    cancelsNumber: links.cancelsNumber,
    cancelReason: row.cancel_reason,
    cancelledBy: links.cancelledBy,
    printedAt: row.printed_at,
    whatsappSentAt: row.whatsapp_sent_at,
  };
}

/** « Octobre 2026 » dans la langue donnée. */
export function salaryPeriodLabel(period: PayrollMonth, locale: Locale): string {
  const label = formatMonth(`${monthKey(period)}-01`, locale);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Message WhatsApp proposé (modifiable avant l'envoi). */
export function salaryReceiptMessage(
  receipt: Pick<SalaryReceiptView, "number" | "memberName" | "period" | "center">,
  amount: string,
  link: string,
  labels: AppLabels,
  locale: Locale,
): string {
  return labels.salaryReceipts.whatsappMessage({
    member: receipt.memberName,
    period: salaryPeriodLabel(receipt.period, locale),
    amount,
    number: receipt.number,
    link,
    center: receipt.center.name,
  });
}
