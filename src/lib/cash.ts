import type { PaymentMethod } from "@/lib/receipts";
import type { Database } from "@/lib/supabase/database.types";

export type CashSessionStatus = Database["public"]["Enums"]["cash_session_status"];
export type CashMovementKind = Database["public"]["Enums"]["cash_movement_kind"];

/** Mouvements saisis depuis l'écran de caisse (la correction passe par la vue admin). */
export const ASSISTANT_MOVEMENT_KINDS = ["bank_deposit", "refund", "float_change"] as const satisfies readonly CashMovementKind[];
export const ADMIN_MOVEMENT_KINDS = [...ASSISTANT_MOVEMENT_KINDS, "expense", "teacher_pay"] as const satisfies readonly CashMovementKind[];

export type CashReceipt = {
  id: string;
  number: string;
  kind: "payment" | "cancellation";
  studentId: string | null;
  studentName: string;
  amount: number;
  method: PaymentMethod | null;
  issuedAt: string;
  issuedByName: string | null;
};

export type CashMovement = {
  id: string;
  kind: CashMovementKind;
  amount: number;
  /** Vide pour l'accueil sur une paie ou une charge (détail réservé à l'admin). */
  reason: string | null;
  createdAt: string;
  createdByName: string | null;
  correctsSessionId: string | null;
};

export type CashSessionSummary = {
  id: string;
  sessionDate: string;
  status: CashSessionStatus;
  isShared: boolean;
  holderName: string | null;
  openedAt: string;
  openedByName: string | null;
  openingFloat: number;
  closedAt: string | null;
  closedByName: string | null;
  validatedAt: string | null;
  validatedByName: string | null;
  countedCash: number | null;
  variance: number | null;
  varianceReason: string | null;
  notes: string | null;
  /** Fonds + espèces encaissées + mouvements (figé à la clôture). */
  expectedCash: number;
  byMethod: Record<PaymentMethod, number>;
  transactions: number;
  movementsTotal: number;
  receipts: CashReceipt[];
  movements: CashMovement[];
};

const MONEY = /^\d{1,10}([.,]\d{1,2})?$/;

/** « 1 250,50 » → 125050 centimes ; null si la saisie n'est pas un montant. */
export function parseCents(value: string): number | null {
  const compact = value.replace(/[\s  ]/g, "");
  if (!MONEY.test(compact)) return null;
  const [units = "0", decimals = ""] = compact.replace(",", ".").split(".");
  return Number(units) * 100 + Number(decimals.padEnd(2, "0"));
}

/** Montant en MAD (nombre) → centimes entiers, sans erreur d'arrondi flottant. */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/** Écart compté − attendu, en centimes : négatif = manquant, positif = excédent. */
export function varianceCents(countedCents: number, expectedCash: number): number {
  return countedCents - toCents(expectedCash);
}
