import "server-only";

import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { type CenterRole, ROLE_HOME, ROUTES, type UserRole } from "@/lib/auth/routes";
import type { Database } from "@/lib/supabase/database.types";
import { type BrandingData, parseBranding } from "@/lib/branding-data";
import { parseVocabularyTerms, type VocabularyTerms } from "@/lib/vocabulary";
import { signPhotoUrls, STAFF_PHOTO_BUCKET } from "@/lib/storage/photos";
import { createClient } from "@/lib/supabase/server";

type CenterStatus = Database["public"]["Enums"]["center_status"];

export type SessionProfile = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  active: boolean;
  /** Nul pour le super-admin, qui n'appartient à aucun centre. */
  centerId: string | null;
  centerName: string;
  /** Statut du centre ; « blocked » : suspendu ou résilié (aucun accès aux données). */
  centerStatus: CenterStatus | null;
  blocked: boolean;
  /** Échéance de l'abonnement : administrateur du centre (et support) uniquement. */
  billing: { dueDate: string; suspensionDate: string; daysBeforeSuspension: number } | null;
  /** Formule et marque appliquée (formule marque blanche uniquement). */
  plan: "standard" | "white_label" | null;
  branding: BrandingData | null;
  /** Vocabulaire de l'interface (type d'établissement du centre). */
  vocabulary: VocabularyTerms;
  /** Super-admin connecté en support (lecture seule) sur ce centre. */
  support: { expiresAt: string } | null;
  /** Chemin de la photo (bucket staff-photos) et son URL signée. */
  photoPath: string | null;
  photoUrl: string | null;
};

/** Compte d'un centre (admin, assistant, professeur). */
export type CenterProfile = SessionProfile & { centerId: string };

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
    .select("id, full_name, role, active, center_id, photo_url, centers(name)")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!profile) return { status: "no-profile", email };

  const [photos, access] = await Promise.all([
    signPhotoUrls(supabase, [profile.photo_url], STAFF_PHOTO_BUCKET),
    supabase.rpc("my_center_access").maybeSingle(),
  ]);
  if (access.error) throw access.error;
  const center = access.data;
  // Super-admin en support : il consulte le centre comme un administrateur (lecture seule).
  const support = profile.role === "super_admin" && center?.support_mode ? { expiresAt: center.support_expires_at ?? "" } : null;

  return {
    status: "authenticated",
    profile: {
      id: profile.id,
      email,
      fullName: profile.full_name,
      role: support ? "admin" : profile.role,
      active: profile.active,
      centerId: support ? (center?.center_id ?? null) : profile.center_id,
      // Nom lu par la fonction d'accès : disponible même centre suspendu.
      centerName: center?.center_name ?? profile.centers?.name ?? "",
      centerStatus: center?.status ?? null,
      blocked: center?.blocked ?? false,
      billing:
        center?.current_period_end && center.suspension_date && center.days_before_suspension !== null
          ? {
              dueDate: center.current_period_end,
              suspensionDate: center.suspension_date,
              daysBeforeSuspension: center.days_before_suspension,
            }
          : null,
      support,
      vocabulary: parseVocabularyTerms(center?.vocabulary),
      plan: center?.plan ?? null,
      branding: parseBranding(center?.branding),
      photoPath: profile.photo_url,
      photoUrl: profile.photo_url ? (photos.get(profile.photo_url) ?? null) : null,
    },
  };
});

/**
 * Garde d'un espace : compte connecté, actif et du rôle attendu.
 * Un compte d'un autre rôle est renvoyé vers son propre espace.
 */
export async function requireRole(role: CenterRole | readonly CenterRole[]): Promise<CenterProfile> {
  const allowed: readonly UserRole[] = typeof role === "string" ? [role] : role;
  const state = await getAuthState();
  if (state.status === "anonymous") redirect(ROUTES.login);
  if (state.status === "no-profile" || !state.profile.active) redirect(ROUTES.inactive);
  if (!allowed.includes(state.profile.role)) redirect(ROLE_HOME[state.profile.role]);
  // Centre suspendu ou résilié : aucun espace, écran dédié (la RLS refuse de toute façon les données).
  // Le support (super-admin, lecture seule) reste possible sur un centre bloqué.
  if (state.profile.blocked && !state.profile.support) redirect(ROUTES.suspended);
  const { centerId } = state.profile;
  if (!centerId) redirect(ROUTES.inactive);
  return { ...state.profile, centerId };
}

/**
 * Garde de la console /platform : tout autre visiteur (anonyme compris)
 * reçoit une 404, pour ne pas révéler l'existence de la console.
 */
export async function requireSuperAdmin(): Promise<SessionProfile> {
  const state = await getAuthState();
  if (state.status !== "authenticated" || !state.profile.active) notFound();
  const { profile } = state;
  // En support, le rôle affiché est « admin » : le vrai rôle reste super-admin.
  if (profile.role !== "super_admin" && !profile.support) notFound();
  return { ...profile, role: "super_admin", centerId: null, centerName: "", support: null, billing: null, plan: null, branding: null };
}

/** Garde des données de l'accueil : administrateur ou assistant. */
export function requireStaff(): Promise<CenterProfile> {
  return requireRole(["admin", "assistant"]);
}
