import { z } from "zod";

import { RESERVED_SLUGS, SLUG_PATTERN } from "@/lib/center-host";
import { LABELS } from "@/lib/constants/labels";
import { MODULE_KEYS } from "@/lib/modules";
import { isValidPhone } from "@/lib/phone";

const V = LABELS.platform.validation;

/** Type d'établissement dont le super-admin saisit chaque terme. */
export const CUSTOM_CENTER_TYPE = "personnalise";
export const VOCABULARY_KEYS = ["learner", "group", "course", "instructor", "session"] as const;
export type VocabularyKey = (typeof VOCABULARY_KEYS)[number];


const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, V.dateInvalid);
const optionalText = (max: number) => z.string().trim().max(max, V.tooLong);
const optionalPhone = z
  .string()
  .trim()
  .refine((value) => value === "" || isValidPhone(value), V.phoneInvalid);
const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .refine((value) => value === "" || z.email().safeParse(value).success, V.emailInvalid);
const amount = z
  .string()
  .trim()
  .regex(/^\d{1,7}([.,]\d{1,2})?$/, V.amountInvalid);

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(SLUG_PATTERN, V.slugInvalid)
  .min(2, V.slugInvalid)
  .max(63, V.slugInvalid)
  .refine((value) => !RESERVED_SLUGS.includes(value), V.slugReserved);

const termSchema = z.object({
  singular: z.string().trim().max(60, V.tooLong),
  plural: z.string().trim().max(60, V.tooLong),
  gender: z.enum(["m", "f"]),
});
export type TermInput = z.infer<typeof termSchema>;

export const customTermsSchema = z.object({
  learner: termSchema,
  group: termSchema,
  course: termSchema,
  instructor: termSchema,
  session: termSchema,
});
export type CustomTermsInput = z.infer<typeof customTermsSchema>;

export const EMPTY_TERMS: CustomTermsInput = {
  learner: { singular: "", plural: "", gender: "m" },
  group: { singular: "", plural: "", gender: "m" },
  course: { singular: "", plural: "", gender: "m" },
  instructor: { singular: "", plural: "", gender: "m" },
  session: { singular: "", plural: "", gender: "f" },
};

/** Vocabulaire : chaque terme est obligatoire pour le type « Personnalisé », ignoré sinon. */
const vocabularyFields = {
  centerType: z.string().min(1, V.typeRequired),
  customTerms: customTermsSchema,
};

function refineVocabulary(values: { centerType: string; customTerms: CustomTermsInput }, ctx: z.RefinementCtx) {
  if (values.centerType !== CUSTOM_CENTER_TYPE) return;
  for (const key of VOCABULARY_KEYS) {
    for (const form of ["singular", "plural"] as const) {
      if (!values.customTerms[key][form]) {
        ctx.addIssue({ code: "custom", message: V.termRequired, path: ["customTerms", key, form] });
      }
    }
  }
}

const identityFields = {
  name: z.string().trim().min(1, V.nameRequired).max(120, V.tooLong),
  ownerName: optionalText(120),
  ownerPhone: optionalPhone,
  ownerEmail: optionalEmail,
  notes: optionalText(2000),
};

const pricingFields = {
  plan: z.string().regex(/^[a-z][a-z_]*$/, V.planRequired),
  price: amount,
  billingInterval: z.enum(["month", "year"]),
  graceDays: z.string().trim().regex(/^\d{1,2}$/, V.graceInvalid).refine((v) => Number(v) <= 60, V.graceInvalid),
};

// ---------------------------------------------------------------------
// Création d'un centre (assistant en quatre étapes)
// ---------------------------------------------------------------------
export const newCenterSchema = z
  .object({
    ...identityFields,
    slug: slugSchema,
    ...vocabularyFields,
    ...pricingFields,
    status: z.enum(["trial", "active"]),
    activationDate: isoDate,
    firstDueDate: isoDate,
    adminName: z.string().trim().min(1, V.nameRequired).max(100, V.tooLong),
    adminEmail: z.string().trim().toLowerCase().min(1, V.emailRequired).pipe(z.email(V.emailInvalid)),
    adminPhone: optionalPhone,
  })
  .superRefine((values, ctx) => {
    refineVocabulary(values, ctx);
    if (values.firstDueDate <= values.activationDate) {
      ctx.addIssue({ code: "custom", message: V.dueAfterActivation, path: ["firstDueDate"] });
    }
  });
export type NewCenterInput = z.infer<typeof newCenterSchema>;

export const NEW_CENTER_STEP_FIELDS = [
  ["name", "slug", "ownerName", "ownerPhone", "ownerEmail", "notes"],
  ["centerType", "customTerms"],
  ["plan", "price", "billingInterval", "graceDays", "status", "activationDate", "firstDueDate"],
  ["adminName", "adminEmail", "adminPhone"],
] as const satisfies readonly (readonly (keyof NewCenterInput)[])[];

// ---------------------------------------------------------------------
// Fiche centre
// ---------------------------------------------------------------------
const centerId = z.uuid();

export const centerDetailsSchema = z
  .object({ centerId, ...identityFields, ...vocabularyFields })
  .superRefine((values, ctx) => refineVocabulary(values, ctx));
export type CenterDetailsInput = z.infer<typeof centerDetailsSchema>;

/** Changement d'adresse (super-admin, confirmation explicite). */
export const centerSlugSchema = z.object({ centerId, slug: slugSchema });
export type CenterSlugInput = z.infer<typeof centerSlugSchema>;

export const centerPricingSchema = z.object({ centerId, ...pricingFields });
export type CenterPricingInput = z.infer<typeof centerPricingSchema>;

export const dueDateSchema = z.object({
  centerId,
  dueDate: isoDate,
  reason: optionalText(300),
});
export type DueDateInput = z.infer<typeof dueDateSchema>;

export const subscriptionPaymentSchema = z.object({
  centerId,
  amount: amount.refine((v) => Number(v.replace(",", ".")) > 0, V.amountInvalid),
  paidAt: isoDate,
  method: z.enum(["bank_transfer", "cash", "card"]),
  reference: optionalText(80),
});
export type SubscriptionPaymentInput = z.infer<typeof subscriptionPaymentSchema>;

export const centerStatusSchema = z.object({
  centerId,
  status: z.enum(["active", "suspended", "cancelled"]),
  reason: z.string().trim().min(1, V.reasonRequired).max(300, V.tooLong),
});
export type CenterStatusInput = z.infer<typeof centerStatusSchema>;

export const platformSettingsSchema = z.object({
  name: optionalText(120),
  phone: optionalPhone,
  email: optionalEmail,
});
export type PlatformSettingsInput = z.infer<typeof platformSettingsSchema>;

export const resendInvitationSchema = z.object({ centerId, userId: z.uuid() });

/** « 1 200,50 » → 1200.5 */
export function parseAmount(value: string): number {
  return Number(value.replace(",", "."));
}

/** Vocabulaire à enregistrer : complet pour « Personnalisé », vide sinon. */
export function termsToSave(centerType: string, customTerms: CustomTermsInput): CustomTermsInput | Record<string, never> {
  return centerType === CUSTOM_CENTER_TYPE ? customTerms : {};
}

// ---------------------------------------------------------------------
// Modules et catalogue
// ---------------------------------------------------------------------
export const centerModuleSchema = z.object({
  centerId: z.uuid(),
  moduleKey: z.enum(MODULE_KEYS),
  enabled: z.boolean(),
  trial: z.boolean(),
});
export type CenterModuleInput = z.infer<typeof centerModuleSchema>;

export const planSchema = z.object({
  key: z.string().regex(/^[a-z][a-z_]*$/, V.planRequired),
  name: z.string().trim().min(1, V.nameRequired).max(60, V.tooLong),
  description: optionalText(300),
  monthlyPrice: amount,
});
export type PlanInput = z.infer<typeof planSchema>;
