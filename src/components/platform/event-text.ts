import type { AppLabels } from "@/lib/constants/labels";
import type { Json } from "@/lib/supabase/database.types";
import { formatDate, formatMAD } from "@/lib/format";
import type { Locale } from "@/lib/i18n/locale";

/** Événement du journal de la plateforme (fiche du centre, page « Journal »). */
export type EventLike = { action: string; payload: Json };

function payloadOf(event: EventLike): Record<string, Json | undefined> | null {
  const payload = event.payload;
  return typeof payload === "object" && payload !== null && !Array.isArray(payload) ? payload : null;
}

export function eventLabel(action: string, P: AppLabels["platform"]): string {
  const labels: Record<string, string> = P.events;
  return labels[action] ?? P.eventFallback;
}

/** Précision lisible : statuts, pack, module, échéance, montant, courriel. */
export function eventDetail(event: EventLike, LABELS: AppLabels, locale: Locale, moduleNames: Record<string, string> = {}): string | null {
  const P = LABELS.platform;
  const payload = payloadOf(event);
  if (!payload) return null;
  const from = typeof payload.from === "string" ? payload.from : null;
  const to = typeof payload.to === "string" ? payload.to : null;
  const statusLabels: Record<string, string> = P.centerStatus;
  const planLabels: Record<string, string> = P.plan;
  const methodLabels: Record<string, string> = P.paymentMethod;
  const moduleName = typeof payload.module === "string" ? payload.module : null;
  const sourceLabels: Record<string, string> = P.modules.source;
  const source = typeof payload.source === "string" ? payload.source : null;
  switch (event.action) {
    case "center.status_changed":
      return from && to ? `${statusLabels[from] ?? from} → ${statusLabels[to] ?? to}` : null;
    case "subscription.plan_changed":
    case "center.plan_changed":
      return from && to ? `${planLabels[from] ?? from} → ${planLabels[to] ?? to}` : null;
    case "center.module_enabled":
    case "center.module_disabled":
      return moduleName ? `${moduleNames[moduleName] ?? moduleName}${source ? ` · ${sourceLabels[source] ?? source}` : ""}` : null;
    case "center.period_changed":
      return to ? `${from ? `${formatDate(from)} → ` : ""}${formatDate(to)}` : null;
    case "subscription.payment_recorded": {
      if (typeof payload.amount !== "number") return null;
      const method = typeof payload.method === "string" ? methodLabels[payload.method] : null;
      return [formatMAD(payload.amount, locale, { cents: true }), method].filter(Boolean).join(" · ");
    }
    case "center.admin_invited":
      return typeof payload.email === "string" ? payload.email : null;
    case "center.access_suspended":
    case "center.access_reactivated": {
      const kind = typeof payload.kind === "string" ? payload.kind : typeof payload.previous_kind === "string" ? payload.previous_kind : null;
      return kind ? (LABELS.platformConsole.access.kinds[kind] ?? kind) : null;
    }
    case "center.admin_password_reset":
      return typeof payload.full_name === "string" ? payload.full_name : null;
    default:
      return null;
  }
}

export function eventReason(event: EventLike): string | null {
  const payload = payloadOf(event);
  return payload && typeof payload.reason === "string" ? payload.reason : null;
}
