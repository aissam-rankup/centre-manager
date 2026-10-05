import "server-only";

import { NEXT_PARAM, OTHER_CENTER_PARAM, PLATFORM_ACCOUNT, safeNextPath, TRANSFER_PARAM } from "@/lib/auth/routes";
import { getCurrentCenter } from "@/lib/branding";
import { centerAccessDecision, getCenterUrl, subdomainsEnabled } from "@/lib/center-host";
import type { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

type LoginContext = {
  /** Centre du compte qui vient de se connecter (null : console de la plateforme). */
  accountCenterId: string | null;
  superAdmin: boolean;
  /** Écran de connexion du rôle (équipe ou élève). */
  loginPath: string;
  next: string | null;
};

/**
 * Après une connexion réussie : adresse où envoyer le compte s'il n'est pas
 * sur celle de son centre, sinon null.
 *  - adresse d'un autre centre (ou console sur l'adresse d'un centre) :
 *    déconnexion, écran de connexion avec le lien vers la bonne adresse ;
 *  - domaine racine (sous-domaines actifs) : compte d'un centre déconnecté et
 *    envoyé vers l'écran de connexion de son centre (se reconnecter une fois).
 * L'adresse ne donne aucun droit : la RLS reste fondée sur le centre du profil.
 */
export async function centerLoginRedirect(supabase: ServerClient, context: LoginContext): Promise<string | null> {
  const current = await getCurrentCenter();
  const decision = centerAccessDecision({
    hostCenterId: current?.centerId ?? null,
    accountCenterId: context.accountCenterId,
    superAdmin: context.superAdmin,
    subdomains: subdomainsEnabled(),
  });
  if (decision === "allow") return null;

  if (decision === "wrong-center") {
    const own = context.superAdmin ? PLATFORM_ACCOUNT : await accountCenterSlug(supabase);
    await supabase.auth.signOut({ scope: "local" });
    const params = new URLSearchParams(own ? { [OTHER_CENTER_PARAM]: own } : {});
    return `${context.loginPath}${params.size ? `?${params.toString()}` : ""}`;
  }

  const own = await accountCenterSlug(supabase);
  if (!own) return null;
  await supabase.auth.signOut({ scope: "local" });
  const params = new URLSearchParams({ [TRANSFER_PARAM]: "1" });
  const next = safeNextPath(context.next);
  if (next) params.set(NEXT_PARAM, next);
  return getCenterUrl({ slug: own }, `${context.loginPath}?${params.toString()}`);
}

async function accountCenterSlug(supabase: ServerClient): Promise<string | null> {
  const { data, error } = await supabase.rpc("my_center_slug");
  return error ? null : (data ?? null);
}
