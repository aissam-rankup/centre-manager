import { z } from "zod";

import type { AppLabels } from "@/lib/constants/labels";
import { DISCOUNT_REASONS, DISCOUNT_SCOPES, DISCOUNT_TYPES } from "@/lib/discounts";

/** Cible d'une remise ciblée : « subject:<id> » ou « pack:<id> ». */
export const DISCOUNT_TARGET_PATTERN = /^(subject|pack):[0-9a-f-]{36}$/;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function discountSchemas(LABELS: AppLabels) {
  const V = LABELS.discounts.validation;
  const date = z.string().regex(ISO_DATE, V.dateInvalid);

  const discountSchema = z
    .object({
      id: z.uuid().optional(),
      studentId: z.uuid(),
      type: z.enum(DISCOUNT_TYPES),
      value: z.coerce.number(V.valueRequired).gt(0, V.valueRequired),
      scope: z.enum(DISCOUNT_SCOPES),
      target: z.string().trim(),
      reason: z.enum(DISCOUNT_REASONS),
      reasonNote: z.string().trim().max(200, V.noteTooLong),
      validFrom: date,
      validTo: z.union([date, z.literal("")]),
    })
    .superRefine((value, ctx) => {
      if (value.type === "percentage" && value.value > 100) {
        ctx.addIssue({ code: "custom", path: ["value"], message: V.percentMax });
      }
      if (value.type === "fixed_amount" && value.value > 100000) {
        ctx.addIssue({ code: "custom", path: ["value"], message: V.amountMax });
      }
      if (value.scope === "specific_subject" && !DISCOUNT_TARGET_PATTERN.test(value.target)) {
        ctx.addIssue({ code: "custom", path: ["target"], message: V.targetRequired });
      }
      if (value.reason === "other" && value.reasonNote.length === 0) {
        ctx.addIssue({ code: "custom", path: ["reasonNote"], message: V.noteRequired });
      }
      if (value.validTo && value.validTo < value.validFrom) {
        ctx.addIssue({ code: "custom", path: ["validTo"], message: V.endBeforeStart });
      }
    });

  const discountStateSchema = z.object({ id: z.uuid(), active: z.boolean() });

  return { discountSchema, discountStateSchema };
}

export type DiscountFormValues = z.input<ReturnType<typeof discountSchemas>["discountSchema"]>;
