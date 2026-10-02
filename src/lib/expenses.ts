import type { Database } from "@/lib/supabase/database.types";
import type { PaymentMethod } from "@/lib/receipts";

export type ExpenseStatus = Database["public"]["Enums"]["expense_status"];

/** Icônes proposées pour les catégories (noms enregistrés en base). */
export const EXPENSE_ICONS = [
  "house",
  "zap",
  "droplet",
  "wifi",
  "sparkles",
  "package",
  "wrench",
  "landmark",
  "megaphone",
  "ellipsis",
  "receipt",
  "car",
  "book-open",
  "users",
  "shield",
  "printer",
] as const;
export type ExpenseIcon = (typeof EXPENSE_ICONS)[number];

export function toExpenseIcon(value: string): ExpenseIcon {
  return EXPENSE_ICONS.find((icon) => icon === value) ?? "receipt";
}

/** Justificatifs : bucket privé, chemin {center_id}/{fichier}. */
export const EXPENSE_RECEIPTS_BUCKET = "expense-receipts";
/** Sous la limite des Server Actions (3 Mo). */
export const EXPENSE_RECEIPT_MAX_BYTES = 2_900_000;
export const EXPENSE_RECEIPT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export type ExpenseCategoryView = {
  id: string;
  name: string;
  icon: ExpenseIcon;
  isRecurring: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type ExpenseView = {
  id: string;
  categoryId: string;
  label: string;
  amount: number;
  date: string;
  method: PaymentMethod | null;
  receiptPath: string | null;
  /** Lien signé (consultation) du justificatif. */
  receiptUrl: string | null;
  /** Charge d'origine de la série (elle-même si c'est l'originale). */
  seriesId: string;
  /** La série est encore recopiée chaque mois. */
  recurring: boolean;
  status: ExpenseStatus;
  notes: string | null;
  recordedByName: string | null;
};

export type CategoryTotal = { categoryId: string; current: number; previous: number };
