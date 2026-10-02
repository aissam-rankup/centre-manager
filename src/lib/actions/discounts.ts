"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, failure, success } from "@/lib/actions/result";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole } from "@/lib/auth/session";
import { describeCenterError, getLabels } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { discountSchemas } from "@/lib/validation/discounts";

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !result[key]) result[key] = issue.message;
  }
  return result;
}

/** Remises et factures recalculées : fiches et listes de l'admin et de l'accueil. */
function revalidateStudents() {
  revalidatePath(ROUTES.admin.home, "layout");
  revalidatePath(ROUTES.assistant.home, "layout");
}

/** Création ou modification d'une remise (admin). */
export async function saveDiscount(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const parsed = discountSchemas(LABELS).discountSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  const profile = await requireRole("admin");
  const supabase = await createClient();

  const values = parsed.data;
  const [kind, targetId] = values.scope === "specific_subject" ? values.target.split(":") : [null, null];
  const row = {
    type: values.type,
    value: Math.round(values.value * 100) / 100,
    scope: values.scope,
    subject_id: kind === "subject" ? targetId : null,
    pack_id: kind === "pack" ? targetId : null,
    reason: values.reason,
    reason_note: values.reasonNote || null,
    valid_from: values.validFrom,
    valid_to: values.validTo || null,
  };

  const { error } = values.id
    ? await supabase.from("discounts").update(row).eq("id", values.id)
    : await supabase
        .from("discounts")
        .insert({ ...row, student_id: values.studentId, center_id: profile.centerId });
  if (error) return failure(await describeCenterError(error));

  revalidateStudents();
  return success();
}

export async function setDiscountActive(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const parsed = discountSchemas(LABELS).discountStateSchema.safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid);
  await requireRole("admin");
  const supabase = await createClient();

  const { error } = await supabase.from("discounts").update({ is_active: parsed.data.active }).eq("id", parsed.data.id);
  if (error) return failure(await describeCenterError(error));

  revalidateStudents();
  return success();
}

export async function deleteDiscount(id: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid);
  await requireRole("admin");
  const supabase = await createClient();

  const { error } = await supabase.from("discounts").delete().eq("id", parsed.data);
  if (error) return failure(await describeCenterError(error));

  revalidateStudents();
  return success();
}
