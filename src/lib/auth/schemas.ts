import { z } from "zod";

import { LABELS } from "@/lib/constants/labels";

const L = LABELS.auth.validation;

export const loginSchema = z.object({
  email: z.string().trim().min(1, L.emailRequired).pipe(z.email(L.emailInvalid)),
  password: z.string().min(1, L.passwordRequired),
});

export type LoginInput = z.infer<typeof loginSchema>;
