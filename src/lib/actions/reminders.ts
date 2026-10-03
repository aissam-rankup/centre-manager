"use server";

import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { NOTIFICATION_CHANNELS } from "@/lib/absences";
import { type ActionResult, failure, success } from "@/lib/actions/result";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole, requireStaff } from "@/lib/auth/session";
import { getSessionBrand } from "@/lib/branding";
import { getReminderQueue, getReminderSettings } from "@/lib/data/reminders";
import { formatDayMonth, formatMAD } from "@/lib/format";
import { describeCenterError, getLabels } from "@/lib/i18n/server";
import { isValidPhone, toWhatsAppHref } from "@/lib/phone";
import { REMINDER_TYPES, renderReminderMessage } from "@/lib/reminders";
import { createClient } from "@/lib/supabase/server";

function revalidateReminders() {
  revalidatePath(ROUTES.admin.home, "layout");
  revalidatePath(ROUTES.assistant.home, "layout");
}

const sendSchema = z.object({
  runId: z.uuid(),
  studentId: z.uuid(),
  dueDate: z.iso.date(),
  channel: z.enum(NOTIFICATION_CHANNELS),
  phone: z.string().trim().optional(),
});

/**
 * Rappel de paiement au tuteur : WhatsApp (lien pré-rempli renvoyé au
 * navigateur), ou trace d'un appel / d'un échange en personne. Les factures
 * sont relues : une facture réglée entre-temps n'est jamais rappelée.
 */
export async function sendPaymentReminder(input: unknown): Promise<ActionResult<{ href: string | null }>> {
  const LABELS = await getLabels();
  const R = LABELS.reenrollment.reminders;
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid);
  const profile = await requireStaff();

  const items = await getReminderQueue({ runId: parsed.data.runId, studentId: parsed.data.studentId });
  const item = items.find((candidate) => candidate.dueDate === parsed.data.dueDate);
  if (!item) return failure(R.nothingToSend);

  let href: string | null = null;
  let message: string | null = null;
  let template: string | null = null;
  let phone: string | null = item.guardianPhone;

  if (parsed.data.channel === "whatsapp") {
    phone = parsed.data.phone || item.guardianPhone;
    const whatsapp = phone && isValidPhone(phone) ? toWhatsAppHref(phone) : null;
    if (!whatsapp) return failure(R.noPhone, { phone: LABELS.receipts.share.phoneInvalid });

    const [settings, brand] = await Promise.all([getReminderSettings(), getSessionBrand()]);
    const custom = settings.templates[item.type];
    template = custom ? "custom" : "default";
    message = renderReminderMessage(
      custom,
      item.type,
      {
        student: item.fullName,
        month: format(new Date(item.year, item.month - 1, 1), "MMMM", { locale: fr }),
        subjects: item.subjectNames.join(", "),
        amount: formatMAD(item.amountDue),
        date: formatDayMonth(item.dueDate),
        days: R.days(item.daysOverdue ?? 0),
        center: brand.whiteLabel ? brand.name : profile.centerName,
      },
      LABELS,
    );
    href = `${whatsapp}?text=${encodeURIComponent(message)}`;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_payment_reminder", {
    p_run_id: item.runId,
    p_student_id: item.studentId,
    p_due_date: item.dueDate,
    p_channel: parsed.data.channel,
    p_message: message ?? undefined,
    p_phone: phone ?? undefined,
    p_template: template ?? undefined,
    p_is_repeat: Boolean(item.lastSentAt),
  });
  if (error) return failure(await describeCenterError(error));

  revalidateReminders();
  return success({ href });
}

/** Réglages (admin) : activation, jours avant échéance, trois modèles. */
export async function updateReminderSettings(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const R = LABELS.reenrollment.reminders;
  const template = z.string().trim().max(1000, LABELS.centerSettings.templateTooLong);
  const parsed = z
    .object({
      enabled: z.boolean(),
      daysBefore: z.coerce.number(R.settings.daysInvalid).int(R.settings.daysInvalid).min(0, R.settings.daysInvalid).max(28, R.settings.daysInvalid),
      templates: z.object({ upcoming: template, due_today: template, overdue: template }),
    })
    .safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
    return failure(parsed.error.issues[0]?.message ?? LABELS.actions.errors.invalid, fieldErrors);
  }
  const profile = await requireRole("admin");
  const supabase = await createClient();
  // Message identique au message proposé : rien d'enregistré (il suivra les évolutions de l'application).
  const stored = Object.fromEntries(
    REMINDER_TYPES.map((type) => {
      const value = parsed.data.templates[type];
      return [type, value && value !== R.templates[type] ? value : null];
    }),
  ) as Record<(typeof REMINDER_TYPES)[number], string | null>;
  const { error } = await supabase
    .from("centers")
    .update({
      payment_reminders_enabled: parsed.data.enabled,
      reminder_days_before: parsed.data.daysBefore,
      reminder_template_upcoming: stored.upcoming,
      reminder_template_due_today: stored.due_today,
      reminder_template_overdue: stored.overdue,
    })
    .eq("id", profile.centerId);
  if (error) return failure(await describeCenterError(error));
  revalidateReminders();
  return success();
}
