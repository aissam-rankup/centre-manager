import "server-only";

import { LABELS } from "@/lib/constants/labels";
import type { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** Dernière réinitialisation : date et auteur (« Mot de passe réinitialisé le … par … »). */
export type LastPasswordReset = { at: string; by: string };

const RESET_EVENTS = ["reset_by_admin", "reset_by_assistant", "reset_by_super_admin"] as const;

/**
 * Dernière réinitialisation de chaque compte, lue dans le journal (RLS :
 * l'administrateur voit son centre, le super-admin ses propres réinitialisations).
 */
export async function getLastPasswordResets(supabase: ServerClient, userIds: readonly string[]): Promise<Map<string, LastPasswordReset>> {
  const result = new Map<string, LastPasswordReset>();
  if (userIds.length === 0) return result;
  const { data, error } = await supabase
    .from("password_events")
    .select("target_user_id, actor_id, actor_role, created_at")
    .in("target_user_id", [...userIds])
    .in("event_type", [...RESET_EVENTS])
    .order("created_at", { ascending: false });
  if (error) throw error;

  const latest = new Map<string, (typeof data)[number]>();
  for (const row of data) {
    if (row.target_user_id && !latest.has(row.target_user_id)) latest.set(row.target_user_id, row);
  }
  const actorIds = [...new Set([...latest.values()].map((row) => row.actor_id).filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: actors } = await supabase.from("profiles").select("id, full_name").in("id", actorIds);
    for (const actor of actors ?? []) names.set(actor.id, actor.full_name);
  }
  for (const [userId, row] of latest) {
    const by =
      row.actor_role === "super_admin"
        ? LABELS.app.name
        : ((row.actor_id ? names.get(row.actor_id) : undefined) ?? LABELS.passwords.unknownActor);
    result.set(userId, { at: row.created_at, by });
  }
  return result;
}
