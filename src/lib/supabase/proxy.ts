import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { NEXT_PARAM, OTHER_CENTER_PARAM, PLATFORM_ACCOUNT, ROLE_HOME, ROUTES, TRANSFER_PARAM } from "@/lib/auth/routes";
import {
  CENTER_HEADER,
  centerAccessDecision,
  encodeCenter,
  getCenterUrl,
  getRootUrl,
  lookupCenter,
  resolveTarget,
  restCenterFetcher,
  subdomainsEnabled,
  type ResolvedCenter,
} from "@/lib/center-host";
import { LABELS } from "@/lib/constants/labels";
import { publicEnv } from "@/lib/env";
import { moduleForPath, parseModules } from "@/lib/modules";
import type { Database } from "@/lib/supabase/database.types";

/** Claims ajoutés par le hook public.custom_access_token_hook. */
const appClaimsSchema = z.object({
  user_role: z.enum(["admin", "assistant", "teacher", "super_admin", "student_user"]).optional(),
  profile_active: z.boolean().optional(),
  center_status: z.enum(["trial", "active", "past_due", "suspended", "cancelled"]).nullable().optional(),
  center_id: z.string().nullable().optional(),
});

const centerFetcher = restCenterFetcher(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);

function isStudentPath(pathname: string): boolean {
  return pathname === ROUTES.student.home || pathname.startsWith(`${ROUTES.student.home}/`);
}

/** Chemins accessibles sans session. */
const PUBLIC_PATHS: readonly string[] = [ROUTES.login, ROUTES.student.login];
/** Chemins ouverts avec ou sans session, sans redirection (accueil des invités). */
const OPEN_PATHS: readonly string[] = [ROUTES.welcome, ROUTES.suspended];

function isPlatformPath(pathname: string): boolean {
  return pathname === ROUTES.platform.home || pathname.startsWith(`${ROUTES.platform.home}/`);
}

/**
 * Rafraîchit la session Supabase (cookies), impose une session sur toutes les pages
 * non publiques et oriente « / » et « /connexion » vers l'espace du rôle.
 * L'autorisation réelle est vérifiée côté serveur (requireRole) et par la RLS.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;

  // Centre de l'adresse, résolu avant toute réponse : l'en-tête interne part avec la requête.
  // Une valeur venue de l'extérieur n'est jamais transmise.
  request.headers.delete(CENTER_HEADER);
  const target = resolveTarget(request.headers);
  if (target.kind === "legacy") return NextResponse.redirect(getRootUrl(`${pathname}${search}`), 301);

  let center: ResolvedCenter | null = null;
  if (target.kind === "slug" || target.kind === "domain") {
    const lookup = await lookupCenter(target, centerFetcher);
    if (lookup.status === "unavailable") {
      return new NextResponse(LABELS.centerHost.unavailable, { status: 503, headers: { "retry-after": "30" } });
    }
    // Ancienne adresse : redirection permanente vers la nouvelle, chemin conservé.
    if (lookup.status === "moved") return NextResponse.redirect(getCenterUrl({ slug: lookup.slug }, `${pathname}${search}`), 301);
    if (lookup.status === "found") {
      center = lookup.center;
      request.headers.set(CENTER_HEADER, encodeCenter(center));
    } else if (target.kind === "slug") {
      const url = request.nextUrl.clone();
      url.pathname = ROUTES.centerNotFound;
      url.search = "";
      return NextResponse.rewrite(url, { status: 404 });
    }
  }
  // Adresse d'un centre (sous-domaine ou domaine personnalisé) : jamais la console.
  const clientHost = target.kind === "slug" || target.kind === "domain";

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

  /** Adresse (slug) du centre du compte connecté. */
  const accountCenterSlug = async (): Promise<string | null> => {
    const { data: slug, error } = await supabase.rpc("my_center_slug");
    return error ? null : (slug ?? null);
  };

  const claims = data?.claims;

  // Redirections internes : adresse publique du centre (le Worker voit l'hôte racine).
  const redirectTo = (path: string, params?: Record<string, string>) => {
    const url = center ? new URL(getCenterUrl(center, path)) : request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
    const redirect = NextResponse.redirect(url);
    // Conserver les cookies de session éventuellement rafraîchis.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  };

  // Console de la plateforme : 404 pour tout autre visiteur (anonyme compris),
  // afin de ne pas révéler son existence. La garde serveur requireSuperAdmin
  // revérifie le rôle en base (le JWT peut être en retard).
  // Jamais accessible depuis l'adresse d'un centre (sous-domaine ou domaine personnalisé).
  const notFound = () => {
    const url = request.nextUrl.clone();
    url.pathname = "/_introuvable";
    url.search = "";
    const rewrite = NextResponse.rewrite(url, { status: 404 });
    for (const cookie of response.cookies.getAll()) rewrite.cookies.set(cookie);
    return rewrite;
  };

  if (isPlatformPath(pathname) && (clientHost || appClaimsSchema.safeParse(claims ?? {}).data?.user_role !== "super_admin")) {
    return notFound();
  }

  if (OPEN_PATHS.includes(pathname)) return response;

  if (!claims) {
    if (PUBLIC_PATHS.includes(pathname)) return response;
    // Espace élève : sa propre page de connexion (par code).
    if (isStudentPath(pathname)) return redirectTo(ROUTES.student.login);
    const next = pathname === "/" ? undefined : `${pathname}${search}`;
    return redirectTo(ROUTES.login, next ? { [NEXT_PARAM]: next } : undefined);
  }

  const appClaims = appClaimsSchema.safeParse(claims).data;
  const role = appClaims?.user_role;

  // Adresse d'un centre : seuls ses comptes y ont une session. Sinon déconnexion et
  // écran de connexion avec l'adresse du bon centre. L'adresse n'autorise rien :
  // la RLS reste fondée sur le centre du profil.
  const decision = centerAccessDecision({
    hostCenterId: center?.id ?? null,
    accountCenterId: appClaims?.center_id ?? null,
    superAdmin: role === "super_admin",
    // Domaine personnalisé inconnu : traité comme le domaine racine, sans transfert.
    subdomains: target.kind === "root" && subdomainsEnabled() && role !== undefined,
  });
  if (decision === "wrong-center") {
    const own = role === "super_admin" ? PLATFORM_ACCOUNT : await accountCenterSlug();
    await supabase.auth.signOut({ scope: "local" });
    const loginPath = role === "student_user" ? ROUTES.student.login : ROUTES.login;
    return redirectTo(loginPath, own ? { [OTHER_CENTER_PARAM]: own } : undefined);
  }

  // Domaine racine : un compte de centre est envoyé vers l'adresse de son centre
  // (nouvelle connexion une fois : les sessions ne sont pas partagées entre adresses).
  if (decision === "transfer") {
    const own = await accountCenterSlug();
    if (own) {
      await supabase.auth.signOut({ scope: "local" });
      const loginPath = role === "student_user" ? ROUTES.student.login : ROUTES.login;
      const params = new URLSearchParams({ [TRANSFER_PARAM]: "1" });
      const next = pathname === "/" || pathname === loginPath || isStudentPath(pathname) ? null : `${pathname}${search}`;
      if (next) params.set(NEXT_PARAM, next);
      const redirect = NextResponse.redirect(getCenterUrl({ slug: own }, `${loginPath}?${params.toString()}`));
      for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
      return redirect;
    }
  }

  // Centre suspendu ou résilié (d'après le jeton) : écran dédié, sans passer par
  // les espaces. La garde serveur et la RLS relisent le statut en base.
  // Élève : son espace s'en charge (accès refusé → écran de connexion élève avec un message).
  if (
    role !== "student_user" &&
    (appClaims?.center_status === "suspended" || appClaims?.center_status === "cancelled")
  ) {
    return redirectTo(ROUTES.suspended);
  }

  // Accueil et page de connexion : envoi direct vers l'espace du rôle.
  // Les autres chemins ne sont pas filtrés ici : le JWT peut être en retard sur la base
  // (rôle modifié, compte désactivé) et seule la garde serveur requireRole fait foi.
  // Cela évite toute boucle de redirection entre le proxy et les layouts.
  if (pathname === "/" || PUBLIC_PATHS.includes(pathname)) {
    const { user_role: role, profile_active: active } = appClaimsSchema.parse(claims);
    // Élève : son espace (un accès coupé y reçoit le message de l'écran de connexion élève).
    if (role === "student_user") {
      return pathname === ROUTES.student.login ? response : redirectTo(ROUTES.student.home);
    }
    return redirectTo(role && active !== false ? ROLE_HOME[role] : ROUTES.inactive);
  }

  // Route d'un module absent de l'offre du centre : 404, lu en base (center_modules).
  // Les gardes serveur (requireModule) et la base (RLS, pre-request) le revérifient.
  const requiredModule = moduleForPath(pathname);
  if (requiredModule) {
    const { data: modules, error } = await supabase.rpc("my_modules");
    if (error || !parseModules(modules).includes(requiredModule)) return notFound();
  }

  return response;
}
