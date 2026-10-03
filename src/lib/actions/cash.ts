"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, failure, success } from "@/lib/actions/result";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole, requireStaff } from "@/lib/auth/session";
import { ADMIN_MOVEMENT_KINDS, parseCents } from "@/lib/cash";
import { describeCenterError, getLabels } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

function revalidateCash() {
  revalidatePath(ROUTES.admin.home, "layout");
  revalidatePath(ROUTES.assistant.home, "layout");
}

/** Montant saisi (« 250 », « 250,50 ») → MAD au centime, ou erreur. */
function moneySchema(message: string) {
  return z
    .string()
    .trim()
    .transform((value, context) => {
      const cents = parseCents(value === "" ? "0" : value);
      if (cents === null) {
        context.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return cents / 100;
    });
}

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
  return fieldErrors;
}

/** Ouvre la caisse du jour avec son fonds (déjà ouverte : rien ne change). */
export async function openCashSession(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const parsed = z.object({ openingFloat: moneySchema(LABELS.cash.amountInvalid) }).safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase.rpc("open_cash_session", { p_opening_float: parsed.data.openingFloat });
  if (error) return failure(await describeCenterError(error));
  revalidateCash();
  return success();
}

/** Mouvement d'espèces hors encaissement : sortie (montant positif) ou ajustement du fonds (sens choisi). */
export async function recordCashMovement(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const C = LABELS.cash;
  const parsed = z
    .object({
      kind: z.enum(ADMIN_MOVEMENT_KINDS),
      amount: moneySchema(C.amountInvalid).refine((value) => value > 0, C.amountInvalid),
      direction: z.enum(["in", "out"]).default("out"),
      reason: z.string().trim().min(1, C.movementReasonRequired).max(300),
    })
    .safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  await requireStaff();
  const supabase = await createClient();
  const { kind, amount, direction, reason } = parsed.data;
  const { error } = await supabase.rpc("record_cash_movement", {
    p_kind: kind,
    p_amount: kind === "float_change" && direction === "out" ? -amount : amount,
    p_reason: reason,
  });
  if (error) return failure(await describeCenterError(error));
  revalidateCash();
  return success();
}

/** Clôture : montant compté, motif obligatoire si l'écart n'est pas nul. */
export async function closeCashSession(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const C = LABELS.cash;
  const parsed = z
    .object({
      sessionId: z.uuid(),
      counted: z.string().trim().min(1, C.amountInvalid).pipe(moneySchema(C.amountInvalid)),
      /** Espèces attendues affichées au moment du comptage. */
      expected: z.number().finite(),
      reason: z.string().trim().max(500).optional(),
      notes: z.string().trim().max(1000).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_cash_session", {
    p_session_id: parsed.data.sessionId,
    p_counted: parsed.data.counted,
    p_reason: parsed.data.reason ?? "",
    p_notes: parsed.data.notes ?? "",
    p_expected: parsed.data.expected,
  });
  if (error) return failure(await describeCenterError(error));
  revalidateCash();
  return success();
}

/** Réglages (admin) : une caisse par personne, seuil d'alerte de l'écart. */
export async function updateCashSettings(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const S = LABELS.cash.settings;
  const parsed = z
    .object({ perAssistant: z.boolean(), threshold: z.string().trim().min(1, S.thresholdInvalid).pipe(moneySchema(S.thresholdInvalid)) })
    .safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  const profile = await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase
    .from("centers")
    .update({ cash_session_per_assistant: parsed.data.perAssistant, cash_variance_alert_threshold: parsed.data.threshold })
    .eq("id", profile.centerId);
  if (error) return failure(await describeCenterError(error));
  revalidateCash();
  return success();
}

/** Validation d'une session clôturée (admin) : verrouillée définitivement. */
export async function validateCashSession(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const parsed = z.object({ sessionId: z.uuid(), notes: z.string().trim().max(1000).optional() }).safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid);
  await requireRole("admin");
  const supabase = await createClient();
  const { error } = await supabase.rpc("validate_cash_session", {
    p_session_id: parsed.data.sessionId,
    p_notes: parsed.data.notes ?? "",
  });
  if (error) return failure(await describeCenterError(error));
  revalidateCash();
  return success();
}

/** Correction après clôture (admin) : opération du jour, liée à la session, motivée. */
export async function recordCashCorrection(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const C = LABELS.cash;
  const parsed = z
    .object({
      sessionId: z.uuid(),
      amount: moneySchema(C.amountInvalid).refine((value) => value > 0, C.amountInvalid),
      direction: z.enum(["in", "out"]),
      reason: z.string().trim().min(1, C.movementReasonRequired).max(300),
    })
    .safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  await requireRole("admin");
  const supabase = await createClient();
  const { sessionId, amount, direction, reason } = parsed.data;
  const { error } = await supabase.rpc("record_cash_correction", {
    p_session_id: sessionId,
    p_amount: direction === "out" ? -amount : amount,
    p_reason: reason,
  });
  if (error) return failure(await describeCenterError(error));
  revalidateCash();
  return success();
}
