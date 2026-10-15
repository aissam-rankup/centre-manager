
import { ROUTES } from "@/lib/auth/routes";
import { relativeRedirect } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";

/** Jeton renouvelé (changement obligatoire levé, rôle modifié), puis orientation depuis l'accueil. */
export async function GET() {
  const supabase = await createClient();
  const { error } = await supabase.auth.refreshSession();
  return relativeRedirect(error ? ROUTES.login : "/");
}
