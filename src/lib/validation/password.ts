import { z } from "zod";

import { LABELS } from "@/lib/constants/labels";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password";

const V = LABELS.passwords.validation;

export const newPasswordField = z
  .string()
  .min(1, V.required)
  .min(PASSWORD_MIN_LENGTH, V.tooShort)
  .max(PASSWORD_MAX_LENGTH, V.tooLong);

/** Réinitialisation par un responsable : compte d'équipe ou accès élève, mot de passe généré ou saisi. */
export const resetPasswordSchema = z
  .object({
    userId: z.uuid().optional(),
    studentId: z.uuid().optional(),
    mode: z.enum(["generate", "manual"]),
    password: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (Boolean(value.userId) === Boolean(value.studentId)) {
      ctx.addIssue({ code: "custom", message: V.required, path: ["userId"] });
    }
    if (value.mode === "manual") {
      const parsed = newPasswordField.safeParse(value.password ?? "");
      if (!parsed.success) ctx.addIssue({ code: "custom", message: parsed.error.issues[0]?.message ?? V.tooShort, path: ["password"] });
    }
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Nouveau mot de passe choisi par la personne (changement obligatoire). */
export const forcedPasswordSchema = z
  .object({ next: newPasswordField, confirm: z.string() })
  .refine((value) => value.next === value.confirm, { message: V.mismatch, path: ["confirm"] });
export type ForcedPasswordInput = z.infer<typeof forcedPasswordSchema>;

/** Formulaire du changement obligatoire (mêmes champs que « Mon mot de passe », sans l'actuel). */
export const forcedPasswordFormSchema = z
  .object({ current: z.string(), next: newPasswordField, confirm: z.string() })
  .refine((value) => value.next === value.confirm, { message: V.mismatch, path: ["confirm"] });

/** « Mon mot de passe » : l'actuel est vérifié côté serveur. */
export const myPasswordSchema = z
  .object({ current: z.string().min(1, V.currentRequired).max(PASSWORD_MAX_LENGTH), next: newPasswordField, confirm: z.string() })
  .refine((value) => value.next === value.confirm, { message: V.mismatch, path: ["confirm"] })
  .refine((value) => value.next !== value.current, { message: V.sameAsOld, path: ["next"] });
export type MyPasswordInput = z.infer<typeof myPasswordSchema>;
