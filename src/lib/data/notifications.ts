import "server-only";

import { requireRole } from "@/lib/auth/session";
import { getLabels } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export type NotificationKind = "followUp" | "note" | "absenceAlert";

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  studentId: string;
  studentName: string;
  /** Détail : type et canal de relance, matière de l'alerte… */
  detail: string | null;
  /** Texte libre : note de relance ou note de fiche. */
  body: string | null;
  author: string | null;
  /** ISO 8601. */
  at: string;
  /** Série d'absences consécutives, pour l'administrateur : en tête de liste. */
  priority: boolean;
};

const WINDOW_DAYS = 14;
const LIMIT = 30;

/**
 * Notifications de l'équipe (admin, assistant) : relances et notes de fiche
 * des 14 derniers jours, alertes d'absences ouvertes ; les plus récentes d'abord.
 */
export async function getNotifications(): Promise<NotificationItem[]> {
  const LABELS = await getLabels();
  const profile = await requireRole(["admin", "assistant"]);
  const supabase = await createClient();
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [followUpsResult, notesResult, alertsResult] = await Promise.all([
    supabase
      .from("follow_ups")
      .select("id, type, channel, note, created_at, student_id, students(full_name), profiles(full_name)")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    supabase
      .from("students")
      .select("id, full_name, notes, notes_updated_at, author:profiles!students_notes_updated_by_fkey(full_name)")
      .not("notes", "is", null)
      .gte("notes_updated_at", since)
      .order("notes_updated_at", { ascending: false })
      .limit(LIMIT),
    supabase.from("open_absence_alerts").select("id, student_id, full_name, subject_name, absence_count, created_at").limit(LIMIT),
  ]);
  if (followUpsResult.error) throw followUpsResult.error;
  if (notesResult.error) throw notesResult.error;
  if (alertsResult.error) throw alertsResult.error;

  const items: NotificationItem[] = [
    ...followUpsResult.data.map((row) => ({
      id: `relance-${row.id}`,
      kind: "followUp" as const,
      studentId: row.student_id,
      studentName: row.students?.full_name ?? "",
      detail: `${LABELS.followUp.types[row.type]} · ${LABELS.followUp.channels[row.channel]}`,
      body: row.note,
      author: row.profiles?.full_name ?? null,
      at: row.created_at,
      priority: false,
    })),
    ...notesResult.data.flatMap((row) =>
      row.notes_updated_at
        ? [
            {
              id: `note-${row.id}-${row.notes_updated_at}`,
              kind: "note" as const,
              studentId: row.id,
              studentName: row.full_name,
              detail: null,
              body: row.notes,
              author: row.author?.full_name ?? null,
              at: row.notes_updated_at,
              priority: false,
            },
          ]
        : [],
    ),
    ...alertsResult.data.flatMap((row) =>
      row.id && row.student_id && row.created_at
        ? [
            {
              id: `alerte-${row.id}`,
              kind: "absenceAlert" as const,
              studentId: row.student_id,
              studentName: row.full_name ?? "",
              detail: LABELS.assistant.dashboard.alerts.absences(row.absence_count ?? 3, row.subject_name ?? ""),
              body: null,
              author: null,
              at: row.created_at,
              priority: profile.role === "admin",
            },
          ]
        : [],
    ),
  ];

  return items.sort((a, b) => Number(b.priority) - Number(a.priority) || b.at.localeCompare(a.at)).slice(0, LIMIT);
}
