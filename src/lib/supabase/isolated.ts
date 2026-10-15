import "server-only";

import { createClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Client sans cookies ni persistance (clé publique) : vérifie un mot de passe
 * par une tentative de connexion, sans toucher à la session du navigateur.
 */
export function createIsolatedClient() {
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

/**
 * Le mot de passe ouvre-t-il ce compte ? La session de vérification est
 * aussitôt fermée (portée locale : les autres sessions ne sont pas touchées).
 * null : service indisponible ou trop de tentatives.
 */
export async function passwordMatches(email: string, password: string): Promise<boolean | null> {
  const client = createIsolatedClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "invalid_credentials") return false;
    return null;
  }
  if (data.session) await client.auth.signOut({ scope: "local" });
  return true;
}
