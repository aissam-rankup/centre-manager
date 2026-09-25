import { z } from "zod";

import { LABELS } from "@/lib/constants/labels";
import { isValidPhone } from "@/lib/phone";

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
export const levelSchema = z.object({
  id: z.uuid().nullable(),
  name: name(80),
  sortOrder: z.coerce.number().int(V.sortOrderInvalid).min(0, V.sortOrderInvalid).max(999, V.sortOrderInvalid),
});
export type LevelInput = z.infer<typeof levelSchema>;

export const subjectSchema = z.object({
  id: z.uuid().nullable(),
  levelId: z.uuid(V.levelRequired),
  name: name(80),
  monthlyPrice: z.coerce.number(V.priceInvalid).min(0, V.priceInvalid).max(100000, V.priceInvalid),
});
export type SubjectInput = z.infer<typeof subjectSchema>;

export const packSchema = z.object({
  id: z.uuid().nullable(),
  levelId: z.uuid(V.levelRequired),
  name: name(80),
  monthlyPrice: z.coerce.number(V.priceInvalid).min(0, V.priceInvalid).max(100000, V.priceInvalid),
  active: z.boolean(),
  subjectIds: z.array(z.uuid()).min(1, V.packSubjectsRequired),
});
export type PackInput = z.infer<typeof packSchema>;

// ---------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------
export const slotSchema = z
  .object({
    id: z.uuid().nullable(),
    subjectId: z.uuid(V.subjectRequired),
    teacherId: z.uuid(V.teacherRequired),
    dayOfWeek: z.coerce.number().int().min(0).max(6),
    startTime: time,
    endTime: time,
    room: name(40),
  })
  .refine((slot) => slot.endTime > slot.startTime, { message: V.endBeforeStart, path: ["endTime"] });
export type SlotInput = z.infer<typeof slotSchema>;

// ---------------------------------------------------------------------
// Utilisateurs
// ---------------------------------------------------------------------
export const userCreateSchema = z
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
export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const userUpdateSchema = z.object({
  id: z.uuid(),
  fullName: name(),
  phone: optionalPhone,
  /** Seul le passage admin ↔ assistant est permis ; le rôle professeur est figé. */
  role: z.enum(["admin", "assistant", "teacher"]),
  subjectIds: z.array(z.uuid()),
});
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

// ---------------------------------------------------------------------
// Élèves
// ---------------------------------------------------------------------
export const studentUpdateSchema = z.object({
  id: z.uuid(),
  fullName: name(),
  levelId: z.uuid(V.levelRequired),
  guardianName: z.string().trim().max(100, V.nameTooLong),
  guardianPhone: optionalPhone,
  notes: z.string().trim().max(500, V.notesTooLong),
});
export type StudentUpdateInput = z.infer<typeof studentUpdateSchema>;

export const enrollmentUpdateSchema = z.object({
  id: z.uuid(),
  priceAgreed: z.coerce.number(V.priceInvalid).min(0, V.priceInvalid).max(100000, V.priceInvalid),
  active: z.boolean(),
});
export type EnrollmentUpdateInput = z.infer<typeof enrollmentUpdateSchema>;

export const enrollmentCreateSchema = z.object({
  studentId: z.uuid(),
  subjectId: z.uuid(V.subjectRequired),
});
export type EnrollmentCreateInput = z.infer<typeof enrollmentCreateSchema>;

export const packSubscriptionCreateSchema = z.object({
  studentId: z.uuid(),
  packId: z.uuid(V.packRequired),
});

export const packSubscriptionUpdateSchema = enrollmentUpdateSchema;
