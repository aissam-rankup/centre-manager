"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { NOTIFICATION_CHANNELS, renderAbsenceMessage } from "@/lib/absences";
import { type ActionResult, failure, success } from "@/lib/actions/result";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole, requireStaff } from "@/lib/auth/session";
import { getSessionBrand } from "@/lib/branding";
import { labelsFor } from "@/lib/constants/labels";
import { getAbsenceAlertsSettings } from "@/lib/data/absence-alerts";
import { getFamilyContext } from "@/lib/data/family-locale";
import { getTranslatedTemplate, prepareTranslatedTemplates } from "@/lib/data/message-templates";
import { isTranslatedLocale, TRANSLATED_LOCALES } from "@/lib/message-templates";
import { formatDate, formatDateWithWeekday } from "@/lib/format";
import { describeCenterError, getLabels } from "@/lib/i18n/server";
import { isValidPhone, toWhatsAppHref } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { TEMPLATE_MAX_LENGTH, toCanonicalTokens } from "@/lib/templates";

function revalidateAbsences() {
  revalidatePath(ROUTES.assistant.home, "layout");
  revalidatePath(ROUTES.admin.home, "layout");
}

const notifySchema = z.object({
  attendanceId: z.uuid(),
  channel: z.enum(NOTIFICATION_CHANNELS),
  phone: z.string().trim().optional(),
  repeat: z.boolean().default(false),
});

/**
 * Prévient le responsable d'une absence : WhatsApp (lien pré-rempli renvoyé
 * au navigateur), ou trace d'un appel / d'un échange en personne.
 * Une seule notification par séance, sauf relance explicite.
 */
export async function notifyAbsence(input: unknown): Promise<ActionResult<{ href: string | null }>> {
  const LABELS = await getLabels();
  const A = LABELS.absenceAlerts;
  const parsed = notifySchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid);
  const profile = await requireStaff();
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("absences_to_notify")
    .select("*")
    .eq("attendance_id", parsed.data.attendanceId)
    .maybeSingle();
  if (error) return failure(await describeCenterError(error));
  if (!row?.student_id || !row.session_date) return failure(LABELS.actions.errors.notFound);

  let href: string | null = null;
  let message: string | null = null;
  let phone: string | null = row.guardian_phone;
  let template: string | null = null;

  if (parsed.data.channel === "whatsapp") {
    phone = parsed.data.phone || row.guardian_phone;
    const whatsapp = phone && isValidPhone(phone) ? toWhatsAppHref(phone) : null;
    if (!whatsapp) return failure(A.noPhone, { phone: LABELS.receipts.share.phoneInvalid });

    // Message dans la langue de la famille (fiche de l'élève, sinon réglages du centre).
    const [settings, brand, family] = await Promise.all([getAbsenceAlertsSettings(), getSessionBrand(), getFamilyContext(row.student_id)]);
    const series = row.in_series ?? false;
    // Modèle du centre dans la langue de la famille (le français a sa colonne).
    const custom = isTranslatedLocale(family.locale) ? await getTranslatedTemplate(family.locale, "absence") : settings.template;
    template = series ? "series" : custom ? "custom" : "default";
    const weekday = formatDateWithWeekday(row.session_date, family.locale).split(" ")[0] ?? "";
    message = renderAbsenceMessage(
      custom,
      {
        student: row.full_name ?? "",
        date: formatDate(row.session_date),
        day: weekday,
        subject: row.subject_name ?? "",
        time: row.start_time?.slice(0, 5) ?? family.labels.absenceAlerts.noTime,
        teacher: row.teacher_name ?? "",
        center: brand.whiteLabel ? brand.name : profile.centerName,
      },
      family.labels,
      series,
      family.locale,
    );
    href = `${whatsapp}?text=${encodeURIComponent(message)}`;
  }

  const { error: insertError } = await supabase.from("absence_notifications").insert({
    student_id: row.student_id,
    center_id: profile.centerId,
    attendance_id: parsed.data.attendanceId,
    channel: parsed.data.channel,
    template_used: template,
    message_body: message,
    guardian_phone_used: phone,
    status: "sent",
    is_repeat: parsed.data.repeat,
    is_series: row.in_series ?? false,
  });
  if (insertError) {
    return failure(insertError.code === "23505" ? A.alreadyNotified : await describeCenterError(insertError));
  }

  revalidateAbsences();
  return success({ href });
}

/** Réglages (admin) : activation et modèle du message. */
export async function updateAbsenceAlertsSettings(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const A = LABELS.absenceAlerts;
  const canonical = labelsFor().absenceAlerts.tokens;
  // Longueur contrôlée sur la forme enregistrée (variables d'origine), comme dans la base.
  const parsed = z
    .object({
      enabled: z.boolean(),
      template: z
        .string()
        .trim()
        .refine((value) => toCanonicalTokens(value, A.tokens, canonical).length <= TEMPLATE_MAX_LENGTH, LABELS.centerSettings.templateTooLong),
      // Modèles en arabe et en anglais (vides : message proposé dans la langue de la famille).
      translations: z.partialRecord(z.enum(TRANSLATED_LOCALES), z.string()).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? LABELS.actions.errors.invalid);
  const profile = await requireRole("admin");
  const supabase = await createClient();
  const template = parsed.data.template;
  const prepared = await prepareTranslatedTemplates(
    TRANSLATED_LOCALES.flatMap((locale) => {
      const value = parsed.data.translations?.[locale];
      return value === undefined ? [] : [{ locale, kind: "absence" as const, value }];
    }),
  );
  if (!prepared.ok) return failure(prepared.error);
  const { error } = await supabase
    .from("centers")
    .update({
      absence_notification_enabled: parsed.data.enabled,
      message_templates: prepared.templates,
      // Variables sous leur forme d'origine : le modèle survit à un changement de vocabulaire.
      absence_notification_template:
        template && template !== A.template ? toCanonicalTokens(template, A.tokens, canonical) : null,
    })
    .eq("id", profile.centerId);
  if (error) return failure(await describeCenterError(error));
  revalidateAbsences();
  return success();
}
