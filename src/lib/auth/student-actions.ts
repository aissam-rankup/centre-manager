"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { centerLoginRedirect } from "@/lib/auth/center-login";
import { ROUTES } from "@/lib/auth/routes";
import { LABELS } from "@/lib/constants/labels";
import { LOGIN_CODE_PATTERN, normalizeLoginCode, studentAuthEmail } from "@/lib/student-codes";
import { createClient } from "@/lib/supabase/server";

const L = LABELS.studentLogin;

/** Voir LoginResult : message, ou adresse à ouvrir (navigation complète). */
export type StudentLoginResult = { error: string } | { location: string };

const studentLoginSchema = z.object({
  code: z.string().transform(normalizeLoginCode).pipe(z.string().regex(LOGIN_CODE_PATTERN, L.codeRequired)),
  password: z.string().min(1, L.passwordRequired),
});

/**
 * Connexion d'un élève par son code et son mot de passe. Refusée si l'accès
 * est désactivé, si la plateforme pédagogique n'est plus dans l'offre du
 * centre, ou si le code appartient à un autre centre que l'adresse visitée
 * (déconnexion et lien vers l'adresse de son centre).
 */
export async function signInStudent(input: unknown): Promise<StudentLoginResult> {
  const parsed = studentLoginSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? L.invalid };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: studentAuthEmail(parsed.data.code),
    password: parsed.data.password,
  });
  if (error || !data.user) {
    if (error?.code === "invalid_credentials") return { error: L.invalid };
    if (error?.code === "user_banned") return { error: L.disabled };
    if (error?.code === "over_request_rate_limit" || error?.status === 429) return { error: L.rateLimited };
    return { error: L.unavailable };
  }

  const { data: access } = await supabase.rpc("my_student_access").maybeSingle();
  if (!access?.allowed) {
    await supabase.auth.signOut();
    return { error: access ? L.disabled : L.invalid };
  }

  const elsewhere = await centerLoginRedirect(supabase, {
    accountCenterId: access.center_id,
    superAdmin: false,
    loginPath: ROUTES.student.login,
    next: null,
  });
  return { location: elsewhere ?? ROUTES.student.home };
}

export async function signOutStudent(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(ROUTES.student.login);
}
