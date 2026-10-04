import "server-only";

import { requireStaff } from "@/lib/auth/session";
import { labelsFor } from "@/lib/constants/labels";
import { getLabels } from "@/lib/i18n/server";
import type { ReminderItem, ReminderSettings } from "@/lib/reminders";
import { signPhotoUrls } from "@/lib/storage/photos";
import { createClient } from "@/lib/supabase/server";
import { fromCanonicalTokens } from "@/lib/templates";

/** Réglages des rappels de paiement du centre connecté (accueil et admin). */
export async function getReminderSettings(): Promise<ReminderSettings> {
  const profile = await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("centers")
    .select(
      "payment_reminders_enabled, reminder_days_before, reminder_template_upcoming, reminder_template_due_today, reminder_template_overdue",
    )
    .eq("id", profile.centerId)
    .single();
  if (error) throw error;
  // Modèles enregistrés avec les variables d'origine : affichés dans le vocabulaire du centre.
  const tokens = (await getLabels()).reenrollment.reminders.tokens;
  const canonical = labelsFor().reenrollment.reminders.tokens;
  const shown = (template: string | null) => (template ? fromCanonicalTokens(template, tokens, canonical) : null);
  return {
    enabled: data.payment_reminders_enabled,
    daysBefore: data.reminder_days_before,
    templates: {
      upcoming: shown(data.reminder_template_upcoming),
      due_today: shown(data.reminder_template_due_today),
      overdue: shown(data.reminder_template_overdue),
    },
  };
}

/**
 * Rappels à envoyer (factures non réglées des campagnes confirmées), par
 * élève et par échéance ; pour une campagne ou un élève. Vide si les rappels
 * sont désactivés.
 */
export async function getReminderQueue(filter: { runId?: string; studentId?: string } = {}): Promise<ReminderItem[]> {
  const profile = await requireStaff();
  if (!profile.modules.includes("reenrollment")) return [];
  const LABELS = await getLabels();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("payment_reminder_queue", {
    p_run_id: filter.runId,
    p_student_id: filter.studentId,
  });
  if (error) throw error;
  const photos = await signPhotoUrls(supabase, data.map((row) => row.photo_url));
  return data.map((row) => ({
    runId: row.billing_run_id,
    year: row.period_year,
    month: row.period_month,
    studentId: row.student_id,
    fullName: row.full_name,
    photoUrl: row.photo_url ? (photos.get(row.photo_url) ?? null) : null,
    levelName: row.level_name ?? null,
    guardianName: row.guardian_name ?? null,
    guardianPhone: row.guardian_phone ?? null,
    dueDate: row.due_date,
    type: row.reminder_type,
    daysOverdue: row.days_overdue ?? null,
    suggested: row.suggested,
    amountDue: Number(row.amount_due),
    invoiceIds: row.invoice_ids,
    // Facture de pack : « Pack … », comme dans la fiche de l'élève et ses reçus.
    subjectNames: row.subject_names.map((name, index) => (row.pack_flags[index] ? LABELS.packs.label(name) : name)),
    lastSentAt: row.last_sent_at ?? null,
    lastSentByName: row.last_sent_by_name ?? null,
    lastChannel: row.last_channel ?? null,
    followedUpAt: row.followed_up_at ?? null,
  }));
}
