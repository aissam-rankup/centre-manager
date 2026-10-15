
import { ROUTES, SESSION_CLOSED_PARAM } from "@/lib/auth/routes";
import { relativeRedirect } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";

/**
 * Session fermée ailleurs (mot de passe réinitialisé par un responsable) :
 * le jeton du navigateur est effacé, puis écran de connexion du rôle.
 */
export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const student = data?.claims.user_role === "student_user";
  await supabase.auth.signOut({ scope: "local" });
  const path = `${student ? ROUTES.student.login : ROUTES.login}?${SESSION_CLOSED_PARAM}=fermee`;
  return relativeRedirect(path);
}
