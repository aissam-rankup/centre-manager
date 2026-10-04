"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ROUTES } from "@/lib/auth/routes";
import { getHostCenter } from "@/lib/branding";
import { LABELS } from "@/lib/constants/labels";
import { CENTER_COOKIE } from "@/lib/hosts";
import { LOGIN_CODE_PATTERN, normalizeLoginCode, studentAuthEmail } from "@/lib/student-codes";
import { createClient } from "@/lib/supabase/server";

const L = LABELS.studentLogin;

export type StudentLoginResult = { error: string };

const studentLoginSchema = z.object({
  code: z.string().transform(normalizeLoginCode).pipe(z.string().regex(LOGIN_CODE_PATTERN, L.codeRequired)),
  password: z.string().min(1, L.passwordRequired),
});

/**
 * Connexion d'un élève par son code et son mot de passe. Refusée si l'accès
 * est désactivé, si la plateforme pédagogique n'est plus dans l'offre du
 * centre, ou si le code appartient à un autre centre que l'adresse visitée.
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

  const hostCenter = await getHostCenter();
  if (hostCenter && access.center_id !== hostCenter.centerId) {
    if (hostCenter.viaCookie) {
      (await cookies()).delete(CENTER_COOKIE);
    } else {
      await supabase.auth.signOut();
      return { error: L.wrongCenter };
    }
  }

  redirect(ROUTES.student.home);
}

export async function signOutStudent(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(ROUTES.student.login);
}
