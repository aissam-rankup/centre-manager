import type { AppLabels } from "@/lib/constants/labels";
import { formatMAD } from "@/lib/format";
import { intlLocale, type Locale } from "@/lib/i18n/locale";
import type { Database, Json } from "@/lib/supabase/database.types";

export type DiscountType = Database["public"]["Enums"]["discount_type"];
export type DiscountScope = Database["public"]["Enums"]["discount_scope"];
export type DiscountReason = Database["public"]["Enums"]["discount_reason"];

export const DISCOUNT_TYPES = ["percentage", "fixed_amount"] as const satisfies readonly DiscountType[];
export const DISCOUNT_SCOPES = ["all_subjects", "specific_subject"] as const satisfies readonly DiscountScope[];
export const DISCOUNT_REASONS = ["sibling", "social", "merit", "referral", "other"] as const satisfies readonly DiscountReason[];

/** Ce qu'affichent un badge et une facture : valeur et motif. */
export type DiscountSummary = {
  type: DiscountType;
  value: number;
  reason: DiscountReason;
  reasonNote: string | null;
  scope: DiscountScope;
  /** Matière ou pack visé (portée « une matière »). */
  target: string | null;
};

/** Remise complète (fiche élève). */
export type StudentDiscount = DiscountSummary & {
  id: string;
  subjectId: string | null;
  packId: string | null;
  validFrom: string;
  validTo: string | null;
  isActive: boolean;
  grantedAt: string;
  grantedByName: string | null;
  /** Chevauche une autre remise active sur une même facture possible. */
  conflict: boolean;
};

export type DiscountState = "active" | "inactive" | "expired" | "upcoming";

export function discountState(discount: StudentDiscount, todayIso: string): DiscountState {
  if (!discount.isActive) return "inactive";
  if (discount.validTo && discount.validTo < todayIso) return "expired";
  if (discount.validFrom > todayIso) return "upcoming";
  return "active";
}

/** « 25 % » ou « 100 MAD » ; « 25% » en anglais. */
export function discountValueLabel(discount: Pick<DiscountSummary, "type" | "value">, locale: Locale = "fr"): string {
  if (discount.type === "percentage") {
    const digits = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 2 }).format(discount.value);
    return locale === "en" ? `${digits}%` : `${digits} %`;
  }
  return formatMAD(discount.value);
}

/** Motif lisible : la précision saisie prime pour le motif « autre ». */
export function discountReasonLabel(discount: Pick<DiscountSummary, "reason" | "reasonNote">, LABELS: AppLabels): string {
  if (discount.reason === "other" && discount.reasonNote) return discount.reasonNote;
  return LABELS.discounts.reasons[discount.reason];
}

/** « Remise 25 % — fratrie » */
export function discountBadgeLabel(discount: DiscountSummary, LABELS: AppLabels, locale: Locale = "fr"): string {
  return LABELS.discounts.badge(discountValueLabel(discount, locale), discountReasonLabel(discount, LABELS));
}

/** Portée : « toutes les matières » ou la matière visée. */
export function discountScopeLabel(discount: DiscountSummary, LABELS: AppLabels): string {
  return discount.scope === "all_subjects" ? LABELS.discounts.scopeAll : (discount.target ?? "");
}

function isRecord(value: Json | undefined): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(values: readonly T[], value: Json | undefined): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

/** Remise telle que figée sur une facture ou listée par l'annuaire (jsonb). */
export function parseDiscountSummary(value: Json | undefined): DiscountSummary | null {
  if (!isRecord(value)) return null;
  const { type, reason, scope } = value;
  if (!isOneOf(DISCOUNT_TYPES, type) || !isOneOf(DISCOUNT_REASONS, reason)) return null;
  return {
    type,
    value: Number(value.value ?? 0),
    reason,
    reasonNote: typeof value.reason_note === "string" ? value.reason_note : null,
    scope: isOneOf(DISCOUNT_SCOPES, scope) ? scope : "all_subjects",
    target: typeof value.target === "string" ? value.target : null,
  };
}

export function parseDiscountList(value: Json | null | undefined): DiscountSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = parseDiscountSummary(item);
    return parsed ? [parsed] : [];
  });
}
