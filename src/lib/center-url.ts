import "server-only";

import { appOrigin } from "@/lib/branding";
import { getCenterUrl, subdomainsEnabled } from "@/lib/center-host";
import { createClient } from "@/lib/supabase/server";

/**
 * Lien absolu vers l'adresse d'un centre (courriels, WhatsApp, invitations) :
 * https://<slug>.<ROOT_DOMAIN><path>. Sans ROOT_DOMAIN (un seul domaine) :
 * adresse de l'application.
 */
export async function centerUrl(slug: string | null, path: string): Promise<string> {
  if (slug && subdomainsEnabled()) return getCenterUrl({ slug }, path);
  return `${await appOrigin()}${path}`;
}

/** Adresse du centre du compte connecté. */
export async function myCenterUrl(path: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_center_slug");
  return centerUrl(data ?? null, path);
}

/** Adresse d'un centre désigné (console : super-admin, lecture soumise à la RLS). */
export async function centerUrlById(centerId: string, path: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("centers").select("slug").eq("id", centerId).maybeSingle();
  return centerUrl(data?.slug ?? null, path);
}

/** Motif d'adresse pour les aperçus de la console : « https://{slug}.<ROOT_DOMAIN> ». */
export async function centerAddressPattern(): Promise<string> {
  return subdomainsEnabled() ? getCenterUrl({ slug: "{slug}" }) : appOrigin();
}

/** Anciennes adresses d'un centre (redirigées vers l'actuelle) : console du super-admin. */
export async function centerSlugHistory(centerId: string): Promise<{ slug: string; changedAt: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_center_slug_history", { p_center_id: centerId });
  if (error) throw error;
  return data.map((row) => ({ slug: row.old_slug, changedAt: row.changed_at }));
}
