import { createHash, timingSafeEqual } from "node:crypto";

import { serverEnv } from "@/lib/env.server";
import { purgeDueCenters } from "@/lib/platform/purge";

export const dynamic = "force-dynamic";
// Plusieurs centres et leurs fichiers : laisser le temps de finir.
export const maxDuration = 300;

/** Comparaison à durée constante (empreintes de même longueur). */
function sameSecret(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Tâche quotidienne (pg_cron → pg_net) : suppressions définitives dues.
 * Fermée sans secret configuré ; 404 pour toute requête sans le bon secret.
 * La réponse ne contient que des compteurs.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = serverEnv.PLATFORM_CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !given || !sameSecret(given, secret)) return json({ error: "not_found" }, 404);

  const results = await purgeDueCenters();
  return json({
    purged: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    centers: results.map(({ centerId, ok, files, rows, accounts }) => ({ centerId, ok, files, rows, accounts })),
  });
}
