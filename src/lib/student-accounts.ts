import "server-only";

import { ROUTES } from "@/lib/auth/routes";
import { myCenterUrl } from "@/lib/center-url";
import { generateLoginCode, generateStudentPassword, studentAuthEmail } from "@/lib/student-codes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Identifiants affichés une seule fois à l'accueil (le mot de passe n'est conservé nulle part en clair). */
export type StudentCredentials = { code: string; password: string; loginUrl: string };

type PostgresLikeError = { code?: string; message?: string; hint?: string | null };

/** Durée de blocage d'un compte Auth désactivé (100 ans) ; « none » le débloque. */
const BANNED = "876000h";

/** Écran de connexion élève, à l'adresse du centre (lien transmis au responsable). */
export async function studentLoginUrl(): Promise<string> {
  return myCenterUrl(ROUTES.student.login);
}

/**
 * Ouvre l'accès d'un élève. L'appelant (accueil ou admin) a été vérifié par
 * la Server Action ; la base revérifie son centre et le module, puis rattache
 * le compte. Le compte Auth est créé avec la clé service_role (serveur
 * uniquement) et supprimé si le rattachement échoue.
 */
export async function createStudentAccess(
  studentId: string,
): Promise<{ ok: true; credentials: StudentCredentials } | { ok: false; error: PostgresLikeError | null }> {
  const admin = createAdminClient();
  const supabase = await createClient();
  const password = generateStudentPassword();

  // Code unique : nouvel essai si l'adresse technique existe déjà (rarissime).
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generateLoginCode();
    const { data, error } = await admin.auth.admin.createUser({
      email: studentAuthEmail(code),
      password,
      email_confirm: true,
      app_metadata: { student_access: true },
    });
    if (error) {
      if (error.code === "email_exists" || error.status === 422) continue;
      return { ok: false, error: null };
    }

    const { error: linkError } = await supabase.rpc("register_student_account", {
      p_student_id: studentId,
      p_user_id: data.user.id,
      p_login_code: code,
    });
    if (linkError) {
      await admin.auth.admin.deleteUser(data.user.id);
      return { ok: false, error: linkError };
    }
    return { ok: true, credentials: { code, password, loginUrl: await studentLoginUrl() } };
  }
  return { ok: false, error: null };
}

/** Nouveau mot de passe d'un accès actif (la base vérifie le centre de l'appelant). */
export async function resetStudentAccessPassword(
  studentId: string,
): Promise<{ ok: true; credentials: StudentCredentials } | { ok: false; error: PostgresLikeError | null }> {
  const supabase = await createClient();
  const { data: userId, error } = await supabase.rpc("student_account_user", { p_student_id: studentId });
  if (error || !userId) return { ok: false, error };
  const { data: account } = await supabase.from("student_accounts").select("login_code").eq("student_id", studentId).maybeSingle();
  if (!account) return { ok: false, error: null };

  const password = generateStudentPassword();
  const { error: updateError } = await createAdminClient().auth.admin.updateUserById(userId, { password });
  if (updateError) return { ok: false, error: null };
  return { ok: true, credentials: { code: account.login_code, password, loginUrl: await studentLoginUrl() } };
}

/** Désactive ou réactive l'accès : la base d'abord, puis le blocage du compte Auth. */
export async function setStudentAccessActive(studentId: string, active: boolean): Promise<PostgresLikeError | null> {
  const supabase = await createClient();
  const { data: userId, error } = await supabase.rpc("set_student_account_active", { p_student_id: studentId, p_active: active });
  if (error || !userId) return error;
  const { error: banError } = await createAdminClient().auth.admin.updateUserById(userId, { ban_duration: active ? "none" : BANNED });
  return banError ? { message: banError.message } : null;
}
