"use server";

import { format } from "date-fns";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { NOTIFICATION_CHANNELS } from "@/lib/absences";
import { type ActionResult, failure, success } from "@/lib/actions/result";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole, requireStaff } from "@/lib/auth/session";
import { getSessionBrand } from "@/lib/branding";
import { labelsFor } from "@/lib/constants/labels";
import { getFamilyContext } from "@/lib/data/family-locale";
import { getTranslatedTemplate, prepareTranslatedTemplates } from "@/lib/data/message-templates";
import { isTranslatedLocale, TRANSLATED_LOCALES } from "@/lib/message-templates";
import { getReminderQueue, getReminderSettings } from "@/lib/data/reminders";
import { dateLocale, formatDayMonth, formatMAD } from "@/lib/format";
import { describeCenterError, getLabels } from "@/lib/i18n/server";
import { isValidPhone, toWhatsAppHref } from "@/lib/phone";
import { REMINDER_TYPES, renderReminderMessage } from "@/lib/reminders";
import { createClient } from "@/lib/supabase/server";
import { TEMPLATE_MAX_LENGTH, toCanonicalTokens } from "@/lib/templates";

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

    // Message dans la langue de la famille (fiche de l'élève, sinon réglages du centre).
    const [settings, brand, family] = await Promise.all([getReminderSettings(), getSessionBrand(), getFamilyContext(item.studentId)]);
    // Modèle du centre dans la langue de la famille (le français a ses colonnes).
    const custom = isTranslatedLocale(family.locale)
      ? await getTranslatedTemplate(family.locale, `reminder_${item.type}`)
      : settings.templates[item.type];
    template = custom ? "custom" : "default";
    message = renderReminderMessage(
      custom,
      item.type,
      {
        student: item.fullName,
        month: format(new Date(item.year, item.month - 1, 1), "MMMM", { locale: dateLocale(family.locale) }),
        subjects: item.subjectNames.join(", "),
        amount: formatMAD(item.amountDue, family.locale),
        date: formatDayMonth(item.dueDate, family.locale),
        days: family.labels.reenrollment.reminders.days(item.daysOverdue ?? 0),
        center: brand.whiteLabel ? brand.name : profile.centerName,
      },
      family.labels,
      family.locale,
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
  // Longueur contrôlée sur la forme enregistrée (variables d'origine), comme dans la base.
  const canonical = labelsFor().reenrollment.reminders.tokens;
  const template = z
    .string()
    .trim()
    .refine((value) => toCanonicalTokens(value, R.tokens, canonical).length <= TEMPLATE_MAX_LENGTH, LABELS.centerSettings.templateTooLong);
  const parsed = z
    .object({
      enabled: z.boolean(),
      daysBefore: z.coerce.number(R.settings.daysInvalid).int(R.settings.daysInvalid).min(0, R.settings.daysInvalid).max(28, R.settings.daysInvalid),
      templates: z.object({ upcoming: template, due_today: template, overdue: template }),
      // Modèles en arabe et en anglais par vague (vides : message proposé dans la langue de la famille).
      translations: z.partialRecord(z.enum(TRANSLATED_LOCALES), z.partialRecord(z.enum(REMINDER_TYPES), z.string())).optional(),
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
  // Variables enregistrées sous leur forme d'origine : le modèle survit à un changement de vocabulaire.
  const stored = Object.fromEntries(
    REMINDER_TYPES.map((type) => {
      const value = parsed.data.templates[type];
      return [type, value && value !== R.templates[type] ? toCanonicalTokens(value, R.tokens, canonical) : null];
    }),
  ) as Record<(typeof REMINDER_TYPES)[number], string | null>;
  const prepared = await prepareTranslatedTemplates(
    TRANSLATED_LOCALES.flatMap((locale) =>
      REMINDER_TYPES.flatMap((type) => {
        const value = parsed.data.translations?.[locale]?.[type];
        return value === undefined ? [] : [{ locale, kind: `reminder_${type}` as const, value }];
      }),
    ),
  );
  if (!prepared.ok) return failure(prepared.error);
  const { error } = await supabase
    .from("centers")
    .update({
      payment_reminders_enabled: parsed.data.enabled,
      message_templates: prepared.templates,
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
