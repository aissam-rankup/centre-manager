/**
 * Adresse demandée → plateforme, sous-domaine d'un centre (slug) ou domaine
 * personnalisé. Actif seulement si PLATFORM_ROOT_DOMAIN est défini
 * (ex. « centromanager.ma ») : sans lui, toute adresse est celle de la
 * plateforme (déploiement sur un seul domaine).
 */
/** Cookie du centre choisi par « /connexion?centre=<adresse> » (déploiement sur un seul domaine). */
export const CENTER_COOKIE = "cm_centre";
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type HostTarget = { kind: "platform" } | { kind: "slug"; slug: string } | { kind: "domain"; domain: string };

const PLATFORM_SUBDOMAINS = new Set(["www", "app", "admin", "platform", "plateforme", "api"]);

function hostname(value: string | null): string {
  return (value ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

export function resolveHost(hostHeader: string | null, rootDomain = process.env.PLATFORM_ROOT_DOMAIN): HostTarget {
  const root = hostname(rootDomain ?? null);
  const host = hostname(hostHeader);
  if (!root || !host) return { kind: "platform" };

  const appHost = hostname(process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).host : null);
  if (host === root || host === appHost || host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return { kind: "platform" };

  if (host.endsWith(`.${root}`)) {
    const sub = host.slice(0, -root.length - 1);
    if (!sub.includes(".") && !PLATFORM_SUBDOMAINS.has(sub)) return { kind: "slug", slug: sub };
    return { kind: "platform" };
  }
  return { kind: "domain", domain: host };
}
