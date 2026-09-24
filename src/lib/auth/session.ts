import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { ROLE_HOME, ROUTES, type UserRole } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/server";

export type SessionProfile = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  active: boolean;
  centerId: string;
  centerName: string;
};

export type AuthState =
  | { status: "anonymous" }
  /** Compte Auth sans profil applicatif : aucun accès. */
  | { status: "no-profile"; email: string }
  | { status: "authenticated"; profile: SessionProfile };

/**
 * État d'authentification, avec le profil lu en base (source de vérité, et non le JWT).
 * Mis en cache pour la durée d'un rendu serveur.
 */
export const getAuthState = cache(async (): Promise<AuthState> => {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData) return { status: "anonymous" };

  const { sub: userId, email: rawEmail } = claimsData.claims;
  const email = typeof rawEmail === "string" ? rawEmail : "";

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, active, center_id, centers(name)")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!profile) return { status: "no-profile", email };

  return {
    status: "authenticated",
    profile: {
      id: profile.id,
      email,
      fullName: profile.full_name,
      role: profile.role,
      active: profile.active,
      centerId: profile.center_id,
      // Le centre n'est lisible que par un compte actif (RLS).
      centerName: profile.centers?.name ?? "",
    },
  };
});

/**
 * Garde d'un espace : compte connecté, actif et du rôle attendu.
 * Un compte d'un autre rôle est renvoyé vers son propre espace.
 */
export async function requireRole(role: UserRole): Promise<SessionProfile> {
  const state = await getAuthState();
  if (state.status === "anonymous") redirect(ROUTES.login);
  if (state.status === "no-profile" || !state.profile.active) redirect(ROUTES.inactive);
  if (state.profile.role !== role) redirect(ROLE_HOME[state.profile.role]);
  return state.profile;
}
