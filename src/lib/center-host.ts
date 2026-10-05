/**
 * Centre désigné par l'adresse visitée : <slug>.<ROOT_DOMAIN>.
 *
 * En production, le Worker Cloudflare relaie *.ROOT_DOMAIN vers l'hébergement
 * (Host = ROOT_DOMAIN) avec trois en-têtes : X-Center-Slug, X-Forwarded-Host
 * et X-Proxy-Secret. X-Center-Slug n'est cru que si X-Proxy-Secret est égal à
 * PROXY_SECRET (comparaison en temps constant) ; sinon la requête est celle du
 * domaine racine. En développement seulement, <slug>.localhost:3000 est lu
 * depuis l'en-tête Host.
 *
 * L'adresse ne sert qu'à l'affichage (marque, écran de connexion) et à
 * l'orientation : elle n'autorise jamais rien. La RLS reste fondée sur le
 * centre du profil.
 *
 * Module sans dépendance serveur : utilisé par le proxy, les pages et les tests.
 */

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Noms réservés (même liste que private.is_reserved_slug en base). */
export const RESERVED_SLUGS: readonly string[] = [
  "www", "app", "admin", "api", "platform", "plateforme", "test", "mail", "ftp", "static", "assets",
  "support", "help", "status", "dev", "staging",
];

/** En-têtes posés par le Worker Cloudflare. */
export const WORKER_HEADERS = {
  slug: "x-center-slug",
  secret: "x-proxy-secret",
  forwardedHost: "x-forwarded-host",
} as const;

/**
 * En-tête interne (proxy → Server Components) : centre résolu, encodé.
 * Toute valeur reçue de l'extérieur est supprimée par le proxy avant résolution.
 */
export const CENTER_HEADER = "x-cm-center";

/** Hébergeur d'origine : l'ancienne adresse redirige vers le domaine racine. */
const LEGACY_HOST_SUFFIXES = [".hostingersite.com"];

export type HostEnv = {
  nodeEnv: string | undefined;
  /** Domaine racine (ex. « dirassty.com » ; en local « localhost:3000 »). */
  rootDomain: string | undefined;
  proxySecret: string | undefined;
};

export function hostEnv(): HostEnv {
  return { nodeEnv: process.env.NODE_ENV, rootDomain: process.env.ROOT_DOMAIN, proxySecret: process.env.PROXY_SECRET };
}

export type HostTarget =
  | { kind: "root" }
  /** Ancienne adresse de l'hébergeur : redirection vers le domaine racine. */
  | { kind: "legacy" }
  | { kind: "slug"; slug: string }
  /** Domaine personnalisé (marque blanche) : hors périmètre, résolu par la même fonction. */
  | { kind: "domain"; domain: string };

function hostname(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

/** Comparaison en temps constant (la durée ne dépend pas du contenu). */
export function safeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** Secret du Worker valable : PROXY_SECRET défini (32 caractères au moins) et identique. */
export function trustedProxy(secretHeader: string | null, env: HostEnv): boolean {
  const expected = env.proxySecret ?? "";
  if (expected.length < 32 || !secretHeader) return false;
  return safeEqual(secretHeader, expected);
}

/** Sous-domaines activés : ROOT_DOMAIN défini. */
export function subdomainsEnabled(env: HostEnv = hostEnv()): boolean {
  return Boolean(hostname(env.rootDomain));
}

/** Développement uniquement : <slug>.localhost lu depuis Host (jamais en production). */
function devHostsEnabled(env: HostEnv): boolean {
  return env.nodeEnv === "development" && hostname(env.rootDomain) === "localhost";
}

/**
 * Adresse visée par la requête. Seule fonction de résolution : un futur
 * domaine personnalisé passera aussi par ici.
 */
export function resolveTarget(headers: Headers, env: HostEnv = hostEnv()): HostTarget {
  const root = hostname(env.rootDomain);
  if (!root) return { kind: "root" };

  const claimed = headers.get(WORKER_HEADERS.slug);
  if (claimed !== null) {
    // En-tête sans le secret : ignoré, la requête est celle du domaine racine.
    if (!trustedProxy(headers.get(WORKER_HEADERS.secret), env)) return { kind: "root" };
    return { kind: "slug", slug: claimed.trim().toLowerCase() };
  }

  const host = hostname(headers.get("host"));
  if (!host || host === root || host === `www.${root}`) return { kind: "root" };
  if (devHostsEnabled(env) && host.endsWith(".localhost")) {
    const sub = host.slice(0, -".localhost".length);
    return sub.includes(".") ? { kind: "root" } : { kind: "slug", slug: sub };
  }
  if (env.nodeEnv === "production" && LEGACY_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return { kind: "legacy" };
  // Hôtes internes (localhost, adresse IP) : domaine racine.
  if (host === "localhost" || host.endsWith(".localhost") || /^[\d.]+$/.test(host) || host.includes(":")) return { kind: "root" };
  return { kind: "domain", domain: host };
}

// ---------------------------------------------------------------------
// Adresses absolues
// ---------------------------------------------------------------------

function protocolFor(root: string): string {
  return hostname(root) === "localhost" ? "http" : "https";
}

function normalizePath(path: string): string {
  if (!path) return "";
  return path.startsWith("/") || path.startsWith("?") ? path : `/${path}`;
}

/** Adresse du domaine racine (console, vitrine). */
export function getRootUrl(path = "", env: HostEnv = hostEnv()): string {
  const root = (env.rootDomain ?? "").trim().toLowerCase().replace(/\/$/, "");
  if (root) return `${protocolFor(root)}://${root}${normalizePath(path)}`;
  return `${(process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "")}${normalizePath(path)}`;
}

/**
 * Adresse d'un centre : https://<slug>.<ROOT_DOMAIN><path>. Tous les liens
 * transmis hors de l'application (courriels, WhatsApp, invitations) passent
 * par ici. Sans ROOT_DOMAIN (un seul domaine) : adresse de l'application.
 */
export function getCenterUrl(center: { slug: string }, path = "", env: HostEnv = hostEnv()): string {
  const root = (env.rootDomain ?? "").trim().toLowerCase().replace(/\/$/, "");
  if (!root) return getRootUrl(path, env);
  return `${protocolFor(root)}://${center.slug}.${root}${normalizePath(path)}`;
}

/** Motif d'adresse calculé par le serveur (ROOT_DOMAIN), ex. « https://{slug}.dirassty.com ». */
export type AddressPattern = string;

/** Adresse d'un centre à partir du motif (console : liste, aperçus). */
export function addressFor(pattern: AddressPattern, slug: string): string {
  return pattern.replace("{slug}", slug);
}

/** Affichage sans protocole : excellence.dirassty.com. */
export function centerAddress(slug: string, env: HostEnv = hostEnv()): string {
  return getCenterUrl({ slug }, "", env).replace(/^https?:\/\//, "");
}

// ---------------------------------------------------------------------
// Centre résolu (proxy → pages)
// ---------------------------------------------------------------------

export type ResolvedCenter = {
  id: string;
  slug: string;
  name: string;
  whiteLabel: boolean;
  branding: unknown;
};

export type CenterLookup =
  | { status: "found"; center: ResolvedCenter }
  | { status: "moved"; slug: string }
  | { status: "unknown" }
  /** Base injoignable : rien n'est gardé en cache. */
  | { status: "unavailable" };

export function encodeCenter(center: ResolvedCenter): string {
  return encodeURIComponent(JSON.stringify(center));
}

export function decodeCenter(value: string | null): ResolvedCenter | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(value));
    if (typeof parsed !== "object" || parsed === null) return null;
    const { id, slug, name, whiteLabel, branding } = parsed as Record<string, unknown>;
    if (typeof id !== "string" || typeof slug !== "string" || typeof name !== "string" || typeof whiteLabel !== "boolean") return null;
    return { id, slug, name, whiteLabel, branding: branding ?? null };
  } catch {
    return null;
  }
}

type CenterRow = { center_id: string; name: string; slug: string; white_label: boolean; branding: unknown; moved: boolean };

export type CenterFetcher = (target: { slug?: string; domain?: string }) => Promise<CenterRow | null>;

/** Lecture par l'API REST de Supabase (clé publique, sans session) : center_for_host. */
export function restCenterFetcher(supabaseUrl: string, anonKey: string): CenterFetcher {
  return async (target) => {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/center_for_host`, {
      method: "POST",
      headers: { apikey: anonKey, authorization: `Bearer ${anonKey}`, "content-type": "application/json" },
      body: JSON.stringify(target.slug ? { p_slug: target.slug } : { p_domain: target.domain }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`center_for_host: ${response.status}`);
    const rows: unknown = await response.json();
    return Array.isArray(rows) && rows.length > 0 ? (rows[0] as CenterRow) : null;
  };
}

const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; value: CenterLookup }>();

export function clearCenterCache(): void {
  cache.clear();
}

/** Centre d'un slug ou d'un domaine, gardé 60 s en mémoire. */
export async function lookupCenter(
  target: { kind: "slug"; slug: string } | { kind: "domain"; domain: string },
  fetcher: CenterFetcher,
  now = Date.now(),
): Promise<CenterLookup> {
  const key = target.kind === "slug" ? `s:${target.slug}` : `d:${target.domain}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.value;

  let value: CenterLookup;
  if (target.kind === "slug" && !SLUG_PATTERN.test(target.slug)) {
    value = { status: "unknown" };
  } else {
    let row: CenterRow | null;
    try {
      row = await fetcher(target.kind === "slug" ? { slug: target.slug } : { domain: target.domain });
    } catch {
      return { status: "unavailable" };
    }
    if (!row) value = { status: "unknown" };
    else if (row.moved) value = { status: "moved", slug: row.slug };
    else
      value = {
        status: "found",
        center: { id: row.center_id, slug: row.slug, name: row.name, whiteLabel: row.white_label, branding: row.branding },
      };
  }
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, { at: now, value });
  return value;
}

// ---------------------------------------------------------------------
// Compte connecté et adresse visitée
// ---------------------------------------------------------------------

export type CenterAccessDecision =
  /** Bonne adresse (ou domaine racine sans sous-domaines) : rien à faire. */
  | "allow"
  /** Adresse d'un autre centre (ou console sur l'adresse d'un centre) : déconnexion et lien vers la bonne adresse. */
  | "wrong-center"
  /** Domaine racine, compte d'un centre : nouvelle connexion sur l'adresse de son centre. */
  | "transfer";

/**
 * Décision unique (proxy, connexion, gardes) : l'adresse oriente, elle
 * n'autorise jamais rien (la RLS reste fondée sur le centre du profil).
 */
export function centerAccessDecision(input: {
  /** Centre de l'adresse visitée (null : domaine racine). */
  hostCenterId: string | null;
  /** Centre du compte (null : console de la plateforme). */
  accountCenterId: string | null;
  superAdmin: boolean;
  subdomains: boolean;
}): CenterAccessDecision {
  if (input.hostCenterId) {
    return !input.superAdmin && input.accountCenterId === input.hostCenterId ? "allow" : "wrong-center";
  }
  if (input.subdomains && !input.superAdmin && input.accountCenterId) return "transfer";
  return "allow";
}
