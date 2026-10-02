import { z } from "zod";

import type { AppLabels } from "@/lib/constants/labels";
import { isValidPhone } from "@/lib/phone";

/** Schémas de validation : messages dans le vocabulaire du centre. */
export function adminSchemas(LABELS: AppLabels) {
  const V = LABELS.admin.validation;

  const name = (max = 100) => z.string().trim().min(1, V.nameRequired).max(max, V.nameTooLong);
  const optionalPhone = z
    .string()
    .trim()
    .refine((value) => value === "" || isValidPhone(value), V.phoneInvalid);
  const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, V.timeInvalid);

  // ---------------------------------------------------------------------
  // Niveaux et matières
  // ---------------------------------------------------------------------
  const levelSchema = z.object({
    id: z.uuid().nullable(),
    name: name(80),
    sortOrder: z.coerce.number().int(V.sortOrderInvalid).min(0, V.sortOrderInvalid).max(999, V.sortOrderInvalid),
  });

  const subjectSchema = z.object({
    id: z.uuid().nullable(),
    levelId: z.uuid(V.levelRequired),
    name: name(80),
    monthlyPrice: z.coerce.number(V.priceInvalid).min(0, V.priceInvalid).max(100000, V.priceInvalid),
  });

  const packSchema = z.object({
    id: z.uuid().nullable(),
    levelId: z.uuid(V.levelRequired),
    name: name(80),
    monthlyPrice: z.coerce.number(V.priceInvalid).min(0, V.priceInvalid).max(100000, V.priceInvalid),
    active: z.boolean(),
    subjectIds: z.array(z.uuid()).min(1, V.packSubjectsRequired),
  });

  // ---------------------------------------------------------------------
  // Planning
  // ---------------------------------------------------------------------
  const slotSchema = z
    .object({
      id: z.uuid().nullable(),
      subjectId: z.uuid(V.subjectRequired),
      teacherId: z.uuid(V.teacherRequired),
      dayOfWeek: z.coerce.number().int().min(0).max(6),
      startTime: time,
      endTime: time,
      roomId: z.uuid(V.roomRequired),
      // Conflits signalés juste avant : clos par l'issue choisie.
      conflictLogIds: z.array(z.uuid()).max(20).default([]),
    })
    .refine((slot) => slot.endTime > slot.startTime, { message: V.endBeforeStart, path: ["endTime"] });

  // ---------------------------------------------------------------------
  // Utilisateurs
  // ---------------------------------------------------------------------
  const userCreateSchema = z
    .object({
      fullName: name(),
      role: z.enum(["admin", "assistant", "teacher"]),
      phone: optionalPhone,
      email: z.string().trim().toLowerCase().min(1, V.emailRequired).pipe(z.email(V.emailInvalid)),
      password: z.string().min(8, V.passwordTooShort).max(72, V.passwordTooShort),
      subjectIds: z.array(z.uuid()),
    })
    .refine((user) => user.role !== "teacher" || user.subjectIds.length > 0, {
      message: V.assignmentsRequired,
      path: ["subjectIds"],
    });

  const userUpdateSchema = z.object({
    id: z.uuid(),
    fullName: name(),
    phone: optionalPhone,
    /** Seul le passage admin ↔ assistant est permis ; le rôle professeur est figé. */
    role: z.enum(["admin", "assistant", "teacher"]),
    subjectIds: z.array(z.uuid()),
  });

  // ---------------------------------------------------------------------
  // Élèves
  // ---------------------------------------------------------------------
  const studentUpdateSchema = z.object({
    id: z.uuid(),
    fullName: name(),
    levelId: z.uuid(V.levelRequired),
    guardianName: z.string().trim().max(100, V.nameTooLong),
    guardianPhone: optionalPhone,
    notes: z.string().trim().max(500, V.notesTooLong),
  });

  const enrollmentUpdateSchema = z.object({
    id: z.uuid(),
    active: z.boolean(),
  });

  const enrollmentCreateSchema = z.object({
    studentId: z.uuid(),
    subjectId: z.uuid(V.subjectRequired),
  });

  const packSubscriptionCreateSchema = z.object({
    studentId: z.uuid(),
    packId: z.uuid(V.packRequired),
  });

  const packSubscriptionUpdateSchema = enrollmentUpdateSchema;

  return { levelSchema, subjectSchema, packSchema, slotSchema, userCreateSchema, userUpdateSchema, studentUpdateSchema, enrollmentUpdateSchema, enrollmentCreateSchema, packSubscriptionCreateSchema, packSubscriptionUpdateSchema };
}

type Schemas = ReturnType<typeof adminSchemas>;

export type LevelInput = z.infer<Schemas["levelSchema"]>;
export type SubjectInput = z.infer<Schemas["subjectSchema"]>;
export type PackInput = z.infer<Schemas["packSchema"]>;
export type SlotInput = z.infer<Schemas["slotSchema"]>;
export type UserCreateInput = z.infer<Schemas["userCreateSchema"]>;
export type UserUpdateInput = z.infer<Schemas["userUpdateSchema"]>;
export type StudentUpdateInput = z.infer<Schemas["studentUpdateSchema"]>;
export type EnrollmentUpdateInput = z.infer<Schemas["enrollmentUpdateSchema"]>;
export type EnrollmentCreateInput = z.infer<Schemas["enrollmentCreateSchema"]>;

