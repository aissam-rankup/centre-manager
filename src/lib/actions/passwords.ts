"use server";

import { revalidatePath } from "next/cache";

import { type ActionResult, failure, success } from "@/lib/actions/result";
import { ROUTES } from "@/lib/auth/routes";
import { getAuthState } from "@/lib/auth/session";
import { centerUrl } from "@/lib/center-url";
import { LABELS } from "@/lib/constants/labels";
import { generateTemporaryPassword } from "@/lib/password";
import { createAdminClient } from "@/lib/supabase/admin";
import { passwordMatches } from "@/lib/supabase/isolated";
import { createClient } from "@/lib/supabase/server";
import { forcedPasswordSchema, myPasswordSchema, resetPasswordSchema } from "@/lib/validation/password";

// Aucun mot de passe n'est journalisé ni renvoyé dans un message d'erreur.

const P = LABELS.passwords;

const REFUSALS = {
  forbidden: P.errors.forbidden,
  other_center: P.errors.forbidden,
  self: P.errors.forbidden,
  inactive: P.errors.inactive,
  rate_limited: P.errors.rate_limited,
  not_found: P.errors.not_found,
} as const;

function refusal(reason: string | null): string {
  return reason && reason in REFUSALS ? REFUSALS[reason as keyof typeof REFUSALS] : P.errors.forbidden;
}

/** Erreurs de l'authentification sur un nouveau mot de passe. */
function describeAuthError(error: { code?: string; status?: number }): { message: string; field?: string } {
  if (error.code === "weak_password") return { message: P.validation.weak, field: "password" };
  if (error.code === "same_password") return { message: P.validation.sameAsOld, field: "next" };
  if (error.code === "over_request_rate_limit" || error.status === 429) return { message: P.errors.rate_limited };
  return { message: P.errors.failed };
}

export type ResetPasswordResult = {
  fullName: string;
  /** Affiché une seule fois, jamais conservé. */
  password: string;
  loginUrl: string;
  /** Accès élève : code de connexion. */
  loginCode: string | null;
  /** Téléphone de la personne (du responsable légal pour un élève) : envoi WhatsApp. */
  phone: string | null;
  student: boolean;
};

/**
 * Réinitialisation par un responsable (administrateur, accueil pour les
 * élèves, super-admin pour les administrateurs). La base décide qui peut
 * réinitialiser qui, journalise les refus et limite à 10 par heure ; le mot
 * de passe est posé avec la clé service_role, puis la personne est
 * déconnectée partout et devra le changer à sa prochaine connexion.
 */
export async function resetPassword(input: unknown): Promise<ActionResult<ResetPasswordResult>> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues.find((item) => item.path[0] === "password");
    return failure(issue?.message ?? LABELS.actions.errors.invalid, issue ? { password: issue.message } : undefined);
  }
  const state = await getAuthState();
  // Compte de l'équipe ou console ; jamais en support (lecture seule) ni avec un mot de passe à changer.
  if (state.status !== "authenticated" || !state.profile.active || state.profile.support || state.profile.mustChangePassword) {
    return failure(P.errors.forbidden);
  }

  const supabase = await createClient();
  const { data: decision, error } = await supabase
    .rpc("authorize_password_reset", {
      p_target_user: parsed.data.userId ?? undefined,
      p_student_id: parsed.data.studentId ?? undefined,
    })
    .maybeSingle();
  if (error || !decision) return failure(P.unavailable);
  // Refus : équivalent d'un 403, déjà inscrit au journal par la base.
  if (!decision.allowed || !decision.target_user_id) return failure(refusal(decision.reason));

  const password = parsed.data.mode === "generate" ? generateTemporaryPassword() : (parsed.data.password ?? "");
  const service = createAdminClient();
  const { error: updateError } = await service.auth.admin.updateUserById(decision.target_user_id, { password });
  if (updateError) {
    const described = describeAuthError(updateError);
    return failure(described.message, described.field ? { password: described.message } : undefined);
  }

  const { error: completeError } = await service.rpc("complete_password_reset", {
    p_actor: state.profile.id,
    p_target_user: decision.target_user_id,
  });
  if (completeError) return failure(P.errors.failed);

  const student = decision.target_role === "student_user";
  revalidatePath(ROUTES.admin.users);
  revalidatePath(ROUTES.platform.centers, "layout");
  if (parsed.data.studentId) {
    revalidatePath(`${ROUTES.admin.students}/${parsed.data.studentId}`);
    revalidatePath(`${ROUTES.assistant.students}/${parsed.data.studentId}`);
  }
  return success({
    fullName: decision.full_name ?? "",
    password,
    loginUrl: await centerUrl(decision.center_slug, student ? ROUTES.student.login : ROUTES.login),
    loginCode: decision.login_code,
    phone: decision.phone,
    student,
  });
}

/** Adresse de connexion (élève : adresse technique dérivée du code). */
async function currentEmail(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? null;
}

/**
 * « Mon mot de passe » : l'actuel est vérifié par une connexion d'essai,
 * le nouveau doit en différer ; les autres sessions sont fermées, celle-ci
 * est gardée.
 */
export async function changeMyPassword(input: unknown): Promise<ActionResult> {
  const parsed = myPasswordSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return failure(LABELS.actions.errors.invalid, fieldErrors);
  }
  const state = await getAuthState();
  if (state.status !== "authenticated" && state.status !== "student") return failure(P.errors.forbidden);
  if (state.status === "authenticated" && state.profile.support) return failure(P.errors.forbidden);

  const email = await currentEmail();
  if (!email) return failure(P.errors.forbidden);
  const matches = await passwordMatches(email, parsed.data.current);
  if (matches === null) return failure(P.unavailable);
  if (!matches) return failure(P.mine.wrongCurrent, { current: P.mine.wrongCurrent });

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.next });
  if (error) {
    const described = describeAuthError(error);
    return failure(described.message, { next: described.message });
  }
  const { error: completeError } = await supabase.rpc("complete_my_password_change");
  if (completeError) return failure(P.errors.failed);
  return success();
}

/**
 * Changement obligatoire (mot de passe temporaire) : nouveau mot de passe
 * personnel, différent du temporaire ; jeton renouvelé pour lever le blocage.
 */
export async function setForcedPassword(input: unknown): Promise<ActionResult<{ location: string }>> {
  const parsed = forcedPasswordSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return failure(LABELS.actions.errors.invalid, fieldErrors);
  }
  const state = await getAuthState();
  if (state.status !== "authenticated" && state.status !== "student") return failure(P.errors.forbidden);

  // Identique au mot de passe temporaire : refusé par l'authentification (same_password).
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.next });
  if (error) {
    const described = describeAuthError(error);
    return failure(described.message, { next: described.message });
  }
  const { error: completeError } = await supabase.rpc("complete_my_password_change");
  if (completeError) return failure(P.errors.failed);
  // Nouveau jeton : le proxy ne redirige plus vers cet écran.
  await supabase.auth.refreshSession();
  return success({ location: "/" });
}
