"use server";

import { redirect } from "next/navigation";

import { centerLoginRedirect } from "@/lib/auth/center-login";
import { destinationAfterLogin, ROUTES } from "@/lib/auth/routes";
import { loginSchema } from "@/lib/auth/schemas";
import { LABELS } from "@/lib/constants/labels";
import { createClient } from "@/lib/supabase/server";

/**
 * Échec : message affichable. Succès ou changement d'adresse (autre centre,
 * transfert depuis le domaine racine) : adresse à ouvrir par une navigation
 * complète (le proxy résout l'adresse du centre à chaque requête ; le rendu
 * interne d'une redirection de Server Action n'y passe pas).
 */
export type LoginResult = { error: string } | { location: string };

const L = LABELS.auth.errors;

/**
 * Connexion par email et mot de passe.
 * Succès : page demandée (si elle appartient au rôle) ou accueil du rôle.
 * Échec : message d'erreur affichable.
 */
export async function signIn(input: unknown, next: string | null): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { error: L.invalidInput };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    if (error?.code === "invalid_credentials") return { error: L.invalidCredentials };
    if (error?.code === "over_request_rate_limit" || error?.status === 429) return { error: L.rateLimited };
    return { error: L.unavailable };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, active, center_id")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile || !profile.active) {
    await supabase.auth.signOut();
    return { error: L.inactive };
  }

  // Adresse d'un centre : seuls ses comptes s'y connectent (sinon déconnexion et lien
  // vers l'adresse de leur centre). Domaine racine : un compte de centre est envoyé
  // vers l'adresse de son centre pour s'y connecter une fois.
  const elsewhere = await centerLoginRedirect(supabase, {
    accountCenterId: profile.center_id,
    superAdmin: profile.role === "super_admin",
    loginPath: ROUTES.login,
    next,
  });
  if (elsewhere) return { location: elsewhere };

  return { location: destinationAfterLogin(profile.role, next) };
}

/**
 * Renouvelle le jeton (claims de rôle et d'activation à jour), puis relance
 * l'orientation depuis l'accueil. Utilisé après la réactivation d'un compte.
 */
export async function refreshAccess(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.refreshSession();
  redirect(error ? ROUTES.login : "/");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(ROUTES.login);
}
