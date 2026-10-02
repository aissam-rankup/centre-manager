"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, failure, success } from "@/lib/actions/result";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole } from "@/lib/auth/session";
import { describeCenterError, getLabels } from "@/lib/i18n/server";
import { PAY_MODES } from "@/lib/payroll";
import { PAYMENT_METHODS } from "@/lib/receipts";
import { createClient } from "@/lib/supabase/server";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function admin() {
  await requireRole("admin");
  return createClient();
}

function revalidatePayroll() {
  revalidatePath(ROUTES.admin.payroll);
  revalidatePath(ROUTES.admin.home);
}

/** Ajustement d'une ligne en brouillon : prime (+) ou retenue / avance (−), motif obligatoire. */
export async function setPayrollAdjustment(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const A = LABELS.payroll.adjustment;
  const parsed = z
    .object({ lineId: z.uuid(), amount: z.number().min(-1_000_000).max(1_000_000), reason: z.string().trim().max(200) })
    .safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid);
  if (parsed.data.amount !== 0 && !parsed.data.reason) return failure(A.reasonRequired, { reason: A.reasonRequired });

  const supabase = await admin();
  const { error } = await supabase.rpc("payroll_set_adjustment", {
    p_line_id: parsed.data.lineId,
    p_amount: Math.round(parsed.data.amount * 100) / 100,
    p_reason: parsed.data.reason,
  });
  if (error) return failure(await describeCenterError(error));
  revalidatePayroll();
  return success();
}

export async function validatePayroll(periodId: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const parsed = z.uuid().safeParse(periodId);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid);
  const supabase = await admin();
  const { error } = await supabase.rpc("payroll_validate", { p_period_id: parsed.data });
  if (error) return failure(await describeCenterError(error));
  revalidatePayroll();
  return success();
}

export async function unlockPayroll(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const U = LABELS.payroll.unlock;
  const parsed = z.object({ periodId: z.uuid(), reason: z.string().trim().min(1).max(300) }).safeParse(input);
  if (!parsed.success) return failure(U.reasonRequired, { reason: U.reasonRequired });
  const supabase = await admin();
  const { error } = await supabase.rpc("payroll_unlock", { p_period_id: parsed.data.periodId, p_reason: parsed.data.reason });
  if (error) return failure(await describeCenterError(error));
  revalidatePayroll();
  return success();
}

export async function markPayrollLinePaid(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const parsed = z
    .object({ lineId: z.uuid(), paidAt: z.string().regex(ISO_DATE), method: z.enum(PAYMENT_METHODS) })
    .safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid);
  const supabase = await admin();
  const { error } = await supabase.rpc("payroll_mark_paid", {
    p_line_id: parsed.data.lineId,
    p_paid_at: parsed.data.paidAt,
    p_method: parsed.data.method,
  });
  if (error) return failure(await describeCenterError(error));
  revalidatePayroll();
  return success();
}

/** Rémunération d'un professeur à partir d'une date (mode, salaire ou taux par matière). */
export async function saveTeacherPay(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const S = LABELS.payroll.settings;
  const parsed = z
    .object({
      teacherId: z.uuid(),
      payMode: z.enum(PAY_MODES),
      effectiveFrom: z.string().regex(ISO_DATE),
      monthlyAmount: z.number().min(0, S.invalidAmount).max(1_000_000, S.invalidAmount).nullable(),
      rates: z.array(z.object({ subjectId: z.uuid(), ratePercent: z.number().min(0, S.invalidRate).max(100, S.invalidRate) })),
    })
    .safeParse(input);
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? LABELS.actions.errors.invalid);
  if (parsed.data.payMode === "fixed_salary" && parsed.data.monthlyAmount === null) {
    return failure(S.invalidAmount, { monthlyAmount: S.invalidAmount });
  }

  const supabase = await admin();
  const { error } = await supabase.rpc("set_teacher_pay", {
    p_teacher_id: parsed.data.teacherId,
    p_pay_mode: parsed.data.payMode,
    p_effective_from: parsed.data.effectiveFrom,
    p_monthly_amount: parsed.data.monthlyAmount ?? undefined,
    p_rates: parsed.data.rates.map((rate) => ({ subject_id: rate.subjectId, rate_percent: rate.ratePercent })),
  });
  if (error) return failure(await describeCenterError(error));
  revalidatePayroll();
  return success();
}
