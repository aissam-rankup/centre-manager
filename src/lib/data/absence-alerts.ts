import "server-only";

import type { AbsenceToNotify } from "@/lib/absences";
import { requireStaff } from "@/lib/auth/session";
import { labelsFor } from "@/lib/constants/labels";
import { getLabels } from "@/lib/i18n/server";
import { signPhotoUrls } from "@/lib/storage/photos";
import { createClient } from "@/lib/supabase/server";
import { fromCanonicalTokens } from "@/lib/templates";

export type AbsenceAlertsSettings = { enabled: boolean; template: string | null };

/** Réglages des alertes d'absence du centre connecté. */
export async function getAbsenceAlertsSettings(): Promise<AbsenceAlertsSettings> {
  const profile = await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("centers")
    .select("absence_notification_enabled, absence_notification_template")
    .eq("id", profile.centerId)
    .single();
  if (error) throw error;
  // Modèle enregistré avec les variables d'origine : affiché dans le vocabulaire du centre.
  const template = data.absence_notification_template;
  return {
    enabled: data.absence_notification_enabled,
    template: template ? fromCanonicalTokens(template, (await getLabels()).absenceAlerts.tokens, labelsFor().absenceAlerts.tokens) : null,
  };
}

/**
 * Absences des sept derniers jours : à signaler d'abord (les plus récentes en
 * tête), puis celles déjà signalées.
 */
export async function getAbsencesToNotify(): Promise<AbsenceToNotify[]> {
  const profile = await requireStaff();
  if (!profile.modules.includes("absence_tracking")) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("absences_to_notify")
    .select("*")
    .order("session_date", { ascending: false })
    .order("start_time", { ascending: false });
  if (error) throw error;

  const photos = await signPhotoUrls(supabase, data.map((row) => row.photo_url));
  const items: AbsenceToNotify[] = data.flatMap((row) =>
    row.attendance_id && row.student_id && row.full_name && row.session_date
      ? [
          {
            attendanceId: row.attendance_id,
            studentId: row.student_id,
            fullName: row.full_name,
            photoUrl: row.photo_url ? (photos.get(row.photo_url) ?? null) : null,
            levelName: row.level_name ?? "",
            subjectName: row.subject_name ?? "",
            sessionDate: row.session_date,
            startTime: row.start_time?.slice(0, 5) ?? null,
            endTime: row.end_time?.slice(0, 5) ?? null,
            teacherName: row.teacher_name,
            guardianName: row.guardian_name,
            guardianPhone: row.guardian_phone,
            inSeries: row.in_series ?? false,
            notifiedAt: row.notified_at,
            notifiedChannel: row.notified_channel,
            notifiedBy: row.notified_by,
          },
        ]
      : [],
  );
  return [...items.filter((item) => !item.notifiedAt), ...items.filter((item) => item.notifiedAt)];
}
