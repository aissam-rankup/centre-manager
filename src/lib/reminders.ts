import type { NotificationChannel } from "@/lib/absences";
import type { AppLabels } from "@/lib/constants/labels";
import type { Database } from "@/lib/supabase/database.types";

export type ReminderType = Database["public"]["Enums"]["payment_reminder_type"];
export const REMINDER_TYPES = ["upcoming", "due_today", "overdue"] as const satisfies readonly ReminderType[];

/** Rappel à envoyer : les factures non réglées d'un élève pour une échéance de campagne. */
export type ReminderItem = {
  runId: string;
  year: number;
  month: number;
  studentId: string;
  fullName: string;
  photoUrl: string | null;
  levelName: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  dueDate: string;
  /** Vague du jour : avant échéance, jour de l'échéance, en retard. */
  type: ReminderType;
  daysOverdue: number | null;
  /** À envoyer aujourd'hui (avant échéance : dans les jours réglés par le centre). */
  suggested: boolean;
  amountDue: number;
  invoiceIds: string[];
  subjectNames: string[];
  /** Dernier rappel de cette vague pour ces factures. */
  lastSentAt: string | null;
  lastSentByName: string | null;
  lastChannel: NotificationChannel | null;
};

export type ReminderSettings = {
  enabled: boolean;
  daysBefore: number;
  /** Modèles du centre ; vides : messages proposés par l'application. */
  templates: Record<ReminderType, string | null>;
};

export type ReminderMessageValues = {
  student: string;
  month: string;
  subjects: string;
  amount: string;
  date: string;
  days: string;
  center: string;
};

/** Message au tuteur : modèle du centre pour la vague, ou message proposé. */
export function renderReminderMessage(
  template: string | null,
  type: ReminderType,
  values: ReminderMessageValues,
  LABELS: AppLabels,
): string {
  const R = LABELS.reenrollment.reminders;
  let message = template?.trim() ? template : R.templates[type];
  for (const key of Object.keys(R.tokens) as (keyof typeof R.tokens)[]) {
    message = message.split(R.tokens[key]).join(values[key]);
  }
  return message;
}

/** Clé d'un rappel : une campagne, un élève, une échéance. */
export function reminderKey(item: Pick<ReminderItem, "runId" | "studentId" | "dueDate">): string {
  return `${item.runId}:${item.studentId}:${item.dueDate}`;
}

/** Premier jour conseillé pour le rappel « avant échéance » (AAAA-MM-JJ). */
export function reminderSuggestedFrom(dueDate: string, daysBefore: number): string {
  const [year = 0, month = 1, day = 1] = dueDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - daysBefore)).toISOString().slice(0, 10);
}
