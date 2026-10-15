import { z } from "zod";

import type { AppLabels } from "@/lib/constants/labels";
import { isValidPhone } from "@/lib/phone";

/** Schémas de validation : messages dans le vocabulaire du centre. */
export function assistantSchemas(LABELS: AppLabels) {
  const S = LABELS.assistant.newStudent.validation;
  const T = LABELS.assistant.newTeacher.validation;

  /** Champ texte facultatif : chaîne vide acceptée. */
  const optionalText = (max: number, message: string) => z.string().trim().max(max, message);

  const optionalPhone = (message: string) =>
    z
      .string()
      .trim()
      .refine((value) => value === "" || isValidPhone(value), message);

  // ---------------------------------------------------------------------
  // Relance
  // ---------------------------------------------------------------------
  const followUpSchema = z.object({
    studentId: z.uuid(),
    invoiceId: z.uuid().nullable(),
    type: z.enum(["payment", "absence"]),
    channel: z.enum(["phone", "whatsapp", "in_person"]),
    note: optionalText(500, LABELS.followUp.validation.noteTooLong),
  });

  // ---------------------------------------------------------------------
  // Nouvel élève
  // ---------------------------------------------------------------------
  const newStudentSchema = z
    .object({
      fullName: z.string().trim().min(1, S.fullNameRequired).max(100, S.fullNameTooLong),
      guardianName: optionalText(100, S.fullNameTooLong),
      guardianPhone: optionalPhone(S.phoneInvalid),
      notes: optionalText(500, S.notesTooLong),
      levelId: z.string().min(1, S.levelRequired).pipe(z.uuid(S.levelRequired)),
      /** Matières à l'unité ou pack : jamais les deux. */
      /** Jour du cycle de paiement : le 1er ou le 15 du mois. */
      billingDay: z.enum(["1", "15"]),
      formula: z.enum(["unit", "pack"]),
      subjectIds: z.array(z.uuid()),
      packId: z.string(),
      /** Ouvrir l'accès élève dans le même geste (centre avec la plateforme pédagogique). */
      studentAccess: z.boolean(),
    })
    .superRefine((values, ctx) => {
      if (values.formula === "unit" && values.subjectIds.length === 0) {
        ctx.addIssue({ code: "custom", path: ["subjectIds"], message: S.subjectsRequired });
      }
      if (values.formula === "pack" && !z.uuid().safeParse(values.packId).success) {
        ctx.addIssue({ code: "custom", path: ["packId"], message: S.packRequired });
      }
    });

  /** Champs validés à chaque étape du formulaire « Nouvel élève ». */

  // ---------------------------------------------------------------------
  // Nouveau professeur
  // ---------------------------------------------------------------------
  const newTeacherSchema = z.object({
    fullName: z.string().trim().min(1, T.fullNameRequired).max(100, S.fullNameTooLong),
    phone: z.string().trim().refine(isValidPhone, T.phoneInvalid),
    email: z.string().trim().toLowerCase().min(1, T.emailRequired).pipe(z.email(T.emailInvalid)),
    password: z.string().min(8, T.passwordTooShort).max(72, T.passwordTooShort),
    subjectIds: z.array(z.uuid()).min(1, T.assignmentsRequired),
  });

  return { followUpSchema, newStudentSchema, newTeacherSchema };
}

type Schemas = ReturnType<typeof assistantSchemas>;

export type FollowUpInput = z.infer<Schemas["followUpSchema"]>;
export type NewStudentInput = z.infer<Schemas["newStudentSchema"]>;
export type NewTeacherInput = z.infer<Schemas["newTeacherSchema"]>;

export const NEW_STUDENT_STEP_FIELDS = [
  ["fullName"],
  ["guardianName", "guardianPhone", "notes"],
  ["levelId", "billingDay", "formula", "subjectIds", "packId"],
  [],
] as const satisfies readonly (readonly (keyof NewStudentInput)[])[];

export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
