import type { AppLabels } from "@/lib/constants/labels";
import type { Locale } from "@/lib/i18n/locale";
import { canonicalTokens } from "@/lib/message-templates";
import type { Database } from "@/lib/supabase/database.types";
import { fillTemplate } from "@/lib/templates";

export type NotificationChannel = Database["public"]["Enums"]["notification_channel"];
export const NOTIFICATION_CHANNELS = ["whatsapp", "phone_call", "in_person"] as const satisfies readonly NotificationChannel[];

/** Absence relevée, à signaler au responsable (ou déjà signalée). */
export type AbsenceToNotify = {
  attendanceId: string;
  studentId: string;
  fullName: string;
  photoUrl: string | null;
  levelName: string;
  subjectName: string;
  sessionDate: string;
  /** « 17:00 » */
  startTime: string | null;
  endTime: string | null;
  teacherName: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  /** Série d'absences consécutives ouverte pour cette matière. */
  inSeries: boolean;
  notifiedAt: string | null;
  notifiedChannel: NotificationChannel | null;
  notifiedBy: string | null;
};

export type AbsenceMessageValues = {
  student: string;
  date: string;
  day: string;
  subject: string;
  time: string;
  teacher: string;
  center: string;
};

/**
 * Message au responsable : modèle du centre dans la langue de la famille, sinon
 * message proposé dans cette langue ; série : message dédié.
 */
export function renderAbsenceMessage(
  template: string | null,
  values: AbsenceMessageValues,
  LABELS: AppLabels,
  series = false,
  locale: Locale = "fr",
): string {
  const A = LABELS.absenceAlerts;
  const custom = template?.trim() ? template : null;
  const message = series ? A.seriesTemplate : (custom ?? A.template);
  return fillTemplate(message, A.tokens, canonicalTokens("absence", locale), values);
}
