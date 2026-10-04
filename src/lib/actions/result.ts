import { LABELS } from "@/lib/constants/labels";

/** Résultat d'une Server Action, sérialisable vers le client. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function success(): ActionResult;
export function success<T>(data: T): ActionResult<T>;
export function success<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function failure<T = undefined>(error: string, fieldErrors?: Record<string, string>): ActionResult<T> {
  return { ok: false, error, fieldErrors };
}

type PostgresLikeError = { code?: string; message?: string; hint?: string | null };

/**
 * Traduit une erreur Postgres / PostgREST en message affichable.
 * Les exceptions métier levées par nos fonctions SQL (codes 22023, P0002…)
 * portent déjà un message en français : il est repris tel quel.
 */
export function describeDatabaseError(error: PostgresLikeError): string {
  switch (error.code) {
    case "42501":
      // Mode support du super-admin : message explicite (lecture seule).
      if (error.message?.startsWith("Mode support")) return error.message;
      // Module absent de l'offre du centre (RLS, pre-request de l'API, déclencheurs).
      if (error.hint?.startsWith("module:") || error.message?.startsWith("Fonctionnalité non incluse")) {
        return LABELS.actions.errors.moduleDisabled;
      }
      return LABELS.actions.errors.forbidden;
    case "22023":
    case "23514":
    case "P0002":
      return error.message ?? LABELS.actions.errors.unexpected;
    case "PGRST116":
      return LABELS.actions.errors.notFound;
    default:
      return LABELS.actions.errors.unexpected;
  }
}
