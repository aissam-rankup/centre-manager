import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { NEXT_PARAM, ROLE_HOME, ROUTES } from "@/lib/auth/routes";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/** Claims ajoutés par le hook public.custom_access_token_hook. */
const appClaimsSchema = z.object({
  user_role: z.enum(["admin", "assistant", "teacher"]).optional(),
  profile_active: z.boolean().optional(),
});

/** Chemins accessibles sans session. */
const PUBLIC_PATHS: readonly string[] = [ROUTES.login];

/**
 * Rafraîchit la session Supabase (cookies), impose une session sur toutes les pages
 * non publiques et oriente « / » et « /connexion » vers l'espace du rôle.
 * L'autorisation réelle est vérifiée côté serveur (requireRole) et par la RLS.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  // Ne rien exécuter entre createServerClient et getClaims : la session doit être rafraîchie ici.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const { pathname, search } = request.nextUrl;

  const redirectTo = (path: string, params?: Record<string, string>) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
    const redirect = NextResponse.redirect(url);
    // Conserver les cookies de session éventuellement rafraîchis.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  };

  if (!claims) {
    if (PUBLIC_PATHS.includes(pathname)) return response;
    const next = pathname === "/" ? undefined : `${pathname}${search}`;
    return redirectTo(ROUTES.login, next ? { [NEXT_PARAM]: next } : undefined);
  }

  // Accueil et page de connexion : envoi direct vers l'espace du rôle.
  // Les autres chemins ne sont pas filtrés ici : le JWT peut être en retard sur la base
  // (rôle modifié, compte désactivé) et seule la garde serveur requireRole fait foi.
  // Cela évite toute boucle de redirection entre le proxy et les layouts.
  if (pathname === "/" || PUBLIC_PATHS.includes(pathname)) {
    const { user_role: role, profile_active: active } = appClaimsSchema.parse(claims);
    return redirectTo(role && active !== false ? ROLE_HOME[role] : ROUTES.inactive);
  }

  return response;
}
