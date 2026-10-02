"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, failure, success } from "@/lib/actions/result";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole, requireStaff } from "@/lib/auth/session";
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

const intentSchema = z.object({
  runId: z.uuid(),
  studentId: z.uuid(),
  intent: z.enum(["pending", "confirmed", "dropped", "paused"]),
  droppedSources: z.array(z.uuid()).max(50).default([]),
  reason: z.string().trim().max(300).optional(),
});

/** Intention d'un élève dans une campagne en brouillon (accueil et admin). */
export async function setReenrollmentIntent(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const parsed = intentSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid);
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_reenrollment_intent", {
    p_run_id: parsed.data.runId,
    p_student_id: parsed.data.studentId,
    p_intent: parsed.data.intent,
    p_dropped_sources: parsed.data.droppedSources,
    p_reason: parsed.data.reason ?? "",
  });
  if (error) return failure(await describeCenterError(error));
  revalidateReenrollment();
  return success();
}

const confirmSummarySchema = z.object({ invoices: z.number(), students: z.number() });

/** Confirmation de la campagne (admin) : les factures sont émises. */
export async function confirmBillingRun(runId: unknown): Promise<ActionResult<{ invoices: number }>> {
  const LABELS = await getLabels();
  const parsed = z.uuid().safeParse(runId);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid);
  await requireRole("admin");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_billing_run", { p_run_id: parsed.data });
  if (error) return failure(await describeCenterError(error));
  revalidateReenrollment();
  const summary = confirmSummarySchema.safeParse(data);
  return success({ invoices: summary.success ? summary.data.invoices : 0 });
}

/** Mois sans cours (admin) : la campagne est écartée, rien n'est facturé ce mois-là. */
export async function cancelBillingRun(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const R = LABELS.reenrollment.review.cancel;
  const parsed = z
    .object({ runId: z.uuid(), reason: z.string().trim().min(1, R.reasonRequired).max(300, R.reasonRequired) })
    .safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return failure(LABELS.actions.errors.invalid, fieldErrors);
  }
  await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_billing_run", { p_run_id: parsed.data.runId, p_reason: parsed.data.reason });
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
