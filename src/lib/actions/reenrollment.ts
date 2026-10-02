"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, failure, success } from "@/lib/actions/result";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole } from "@/lib/auth/session";
import { describeCenterError, getLabels } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

function revalidateReenrollment() {
  revalidatePath(ROUTES.admin.home, "layout");
  revalidatePath(ROUTES.assistant.home, "layout");
}

/** Réinscription automatique : activation, jour de préparation, jour d'échéance. */
export async function updateReenrollmentSettings(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const S = LABELS.reenrollment.settings;
  const day = z.coerce.number(S.dayInvalid).int(S.dayInvalid).min(1, S.dayInvalid).max(28, S.dayInvalid);
  const parsed = z.object({ enabled: z.boolean(), generationDay: day, dueDay: day }).safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return failure(LABELS.actions.errors.invalid, fieldErrors);
  }
  const profile = await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase
    .from("centers")
    .update({
      auto_reenrollment_enabled: parsed.data.enabled,
      billing_generation_day: parsed.data.generationDay,
      payment_due_day: parsed.data.dueDay,
    })
    .eq("id", profile.centerId);
  if (error) return failure(await describeCenterError(error));
  revalidateReenrollment();
  return success();
}

/** Prépare tout de suite le brouillon du mois prochain (sans attendre la nuit). */
export async function prepareBillingRun(): Promise<ActionResult> {
  await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase.rpc("prepare_billing_run");
  if (error) return failure(await describeCenterError(error));
  revalidateReenrollment();
  return success();
}
