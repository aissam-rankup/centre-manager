import "server-only";

import { headers } from "next/headers";

/** En-tête lu par la base (private.request_client_ip) pour le journal de la plateforme. */
export const CLIENT_IP_HEADER = "x-dirassty-client-ip";

const IP_PATTERN = /^[0-9a-f.:]{3,45}$/i;

/**
 * Adresse IP de la personne : celle transmise par Cloudflare, sinon le premier
 * maillon de x-forwarded-for. Indicative (journal), jamais utilisée pour autoriser.
 */
export function clientIpFrom(source: Headers): string | null {
  const candidates = [
    source.get("cf-connecting-ip"),
    source.get("x-forwarded-for")?.split(",")[0],
    source.get("x-real-ip"),
  ];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value && IP_PATTERN.test(value)) return value;
  }
  return null;
}

/** En-têtes à joindre aux appels de la console (createClient({ headers })). */
export async function clientIpHeaders(): Promise<Record<string, string>> {
  const ip = clientIpFrom(await headers());
  return ip ? { [CLIENT_IP_HEADER]: ip } : {};
}
