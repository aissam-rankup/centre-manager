import "server-only";

import { ROUTES } from "@/lib/auth/routes";
import { requireRole } from "@/lib/auth/session";
import { formatDate, formatMAD } from "@/lib/format";
import { getLabels } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export type NotificationKind = "followUp" | "note" | "absenceAlert" | "cashVariance";

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  /** Élève concerné (vide pour une alerte de caisse). */
  studentId: string | null;
  /** Titre : l'élève, ou la caisse. */
  studentName: string;
  /** Lien propre (sinon la fiche de l'élève). */
  href?: string;
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

  const [followUpsResult, notesResult, alertsResult, cashResult] = await Promise.all([
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
    // Écarts de caisse au-delà du seuil, pas encore validés : pour l'admin (hors support).
    profile.role === "admin" && !profile.support
      ? supabase
          .from("cash_sessions")
          .select("id, session_date, variance, variance_reason, closed_at, closer:profiles!cash_sessions_closed_by_fkey(full_name), centers(cash_variance_alert_threshold)")
          .eq("status", "closed")
          .gte("closed_at", since)
          .order("closed_at", { ascending: false })
          .limit(LIMIT)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (followUpsResult.error) throw followUpsResult.error;
  if (notesResult.error) throw notesResult.error;
  if (alertsResult.error) throw alertsResult.error;
  if (cashResult.error) throw cashResult.error;

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
    ...cashResult.data.flatMap((row) => {
      const variance = Number(row.variance ?? 0);
      const threshold = Number(row.centers?.cash_variance_alert_threshold ?? 0);
      return row.closed_at && Math.abs(variance) > threshold
        ? [
            {
              id: `caisse-${row.id}`,
              kind: "cashVariance" as const,
              studentId: null,
              studentName: LABELS.nav.cash,
              href: ROUTES.admin.cash,
              detail: LABELS.cash.notification(formatMAD(variance), formatDate(row.session_date)),
              body: row.variance_reason,
              author: row.closer?.full_name ?? null,
              at: row.closed_at,
              priority: true,
            },
          ]
        : [];
    }),
  ];

  return items.sort((a, b) => Number(b.priority) - Number(a.priority) || b.at.localeCompare(a.at)).slice(0, LIMIT);
}
