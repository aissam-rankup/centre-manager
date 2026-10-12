import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Client Supabase pour les Server Components, Server Actions et Route Handlers.
 * Agit avec la session de l'utilisateur : la RLS s'applique.
 * `headers` : en-têtes ajoutés aux requêtes (ex. adresse IP pour le journal de la plateforme).
 */
export async function createClient(options: { headers?: Record<string, string> } = {}) {
  const cookieStore = await cookies();

  return createServerClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: options.headers ? { headers: options.headers } : undefined,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Appel depuis un Server Component : les cookies sont en lecture seule.
          // Le proxy se charge de rafraîchir la session.
        }
      },
    },
  });
}
