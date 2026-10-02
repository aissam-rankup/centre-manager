"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, failure, success } from "@/lib/actions/result";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole } from "@/lib/auth/session";
import { EXPENSE_ICONS, EXPENSE_RECEIPT_MAX_BYTES, EXPENSE_RECEIPT_TYPES, EXPENSE_RECEIPTS_BUCKET } from "@/lib/expenses";
import { describeCenterError, getLabels } from "@/lib/i18n/server";
import { PAYMENT_METHODS } from "@/lib/receipts";
import { createClient } from "@/lib/supabase/server";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function admin() {
  const profile = await requireRole("admin");
  return { profile, supabase: await createClient() };
}

function revalidateExpenses() {
  revalidatePath(ROUTES.admin.expenses);
  revalidatePath(ROUTES.admin.home);
}

async function schemas() {
  const LABELS = await getLabels();
  const V = LABELS.expenses.validation;
  const fields = {
    categoryId: z.uuid(V.categoryRequired),
    label: z.string().trim().min(1, V.labelRequired).max(120, V.labelRequired),
    amount: z.coerce.number(V.amountInvalid).gt(0, V.amountInvalid).max(10_000_000, V.amountInvalid),
    date: z.string().regex(ISO_DATE, V.dateInvalid),
    method: z.union([z.enum(PAYMENT_METHODS), z.literal("")]),
  };
  return { LABELS, fields };
}

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) result[String(issue.path[0] ?? "")] ??= issue.message;
  return result;
}

/** Dépose le justificatif dans le dossier du centre ; renvoie son chemin (ou null si absent). */
async function uploadReceipt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  centerId: string,
  file: FormDataEntryValue | null,
): Promise<{ ok: true; path: string | null } | { ok: false }> {
  if (!(file instanceof File) || file.size === 0) return { ok: true, path: null };
  const extension = EXPENSE_RECEIPT_TYPES[file.type];
  if (!extension || file.size > EXPENSE_RECEIPT_MAX_BYTES) return { ok: false };
  const path = `${centerId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(EXPENSE_RECEIPTS_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  return error ? { ok: false } : { ok: true, path };
}

/** Saisie rapide d'une charge (justificatif facultatif). */
export async function addExpense(formData: FormData): Promise<ActionResult> {
  const { LABELS, fields } = await schemas();
  const parsed = z
    .object({ ...fields, recurring: z.boolean() })
    .safeParse({
      categoryId: formData.get("categoryId"),
      label: formData.get("label"),
      amount: formData.get("amount"),
      date: formData.get("date"),
      method: formData.get("method") ?? "",
      recurring: formData.get("recurring") === "on",
    });
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  const { profile, supabase } = await admin();

  const upload = await uploadReceipt(supabase, profile.centerId, formData.get("receipt"));
  if (!upload.ok) return failure(LABELS.expenses.validation.receiptInvalid, { receipt: LABELS.expenses.validation.receiptInvalid });

  const { error } = await supabase.from("expenses").insert({
    center_id: profile.centerId,
    category_id: parsed.data.categoryId,
    label: parsed.data.label,
    amount: Math.round(parsed.data.amount * 100) / 100,
    expense_date: parsed.data.date,
    period_year: Number(parsed.data.date.slice(0, 4)),
    period_month: Number(parsed.data.date.slice(5, 7)),
    payment_method: parsed.data.method || null,
    is_recurring: parsed.data.recurring,
    receipt_url: upload.path,
  });
  if (error) {
    if (upload.path) await supabase.storage.from(EXPENSE_RECEIPTS_BUCKET).remove([upload.path]);
    return failure(await describeCenterError(error));
  }
  revalidateExpenses();
  return success();
}

export async function updateExpense(input: unknown): Promise<ActionResult> {
  const { LABELS, fields } = await schemas();
  const parsed = z
    .object({ id: z.uuid(), ...fields, notes: z.string().trim().max(500) })
    .safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  const { supabase } = await admin();
  const { error } = await supabase
    .from("expenses")
    .update({
      category_id: parsed.data.categoryId,
      label: parsed.data.label,
      amount: Math.round(parsed.data.amount * 100) / 100,
      expense_date: parsed.data.date,
      period_year: Number(parsed.data.date.slice(0, 4)),
      period_month: Number(parsed.data.date.slice(5, 7)),
      payment_method: parsed.data.method || null,
      notes: parsed.data.notes || null,
    })
    .eq("id", parsed.data.id);
  if (error) return failure(await describeCenterError(error));
  revalidateExpenses();
  return success();
}

export async function attachExpenseReceipt(formData: FormData): Promise<ActionResult> {
  const LABELS = await getLabels();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return failure(LABELS.actions.errors.invalid);
  const { profile, supabase } = await admin();
  const upload = await uploadReceipt(supabase, profile.centerId, formData.get("receipt"));
  if (!upload.ok || !upload.path) return failure(LABELS.expenses.validation.receiptInvalid);
  const { error } = await supabase.from("expenses").update({ receipt_url: upload.path }).eq("id", id.data);
  if (error) return failure(await describeCenterError(error));
  revalidateExpenses();
  return success();
}

/** Brouillon récurrent : montant ajusté si besoin, puis confirmé. */
export async function confirmExpense(input: unknown): Promise<ActionResult> {
  const { LABELS, fields } = await schemas();
  const parsed = z.object({ id: z.uuid(), amount: fields.amount }).safeParse(input);
  if (!parsed.success) return failure(LABELS.expenses.validation.amountInvalid);
  const { supabase } = await admin();
  const { error } = await supabase
    .from("expenses")
    .update({ status: "confirmed", amount: Math.round(parsed.data.amount * 100) / 100 })
    .eq("id", parsed.data.id);
  if (error) return failure(await describeCenterError(error));
  revalidateExpenses();
  return success();
}

/** Suppression horodatée avec son auteur (la ligne reste en base). */
export async function deleteExpense(id: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid);
  const { supabase } = await admin();
  const { error } = await supabase.rpc("delete_expense", { p_expense_id: parsed.data });
  if (error) return failure(await describeCenterError(error));
  revalidateExpenses();
  return success();
}

/** Arrête la recopie mensuelle d'une série (charge d'origine). */
export async function stopExpenseRecurrence(seriesId: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const parsed = z.uuid().safeParse(seriesId);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid);
  const { supabase } = await admin();
  const { error } = await supabase.from("expenses").update({ is_recurring: false }).eq("id", parsed.data);
  if (error) return failure(await describeCenterError(error));
  revalidateExpenses();
  return success();
}

export async function saveExpenseCategory(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const C = LABELS.expenses.categories;
  const parsed = z
    .object({
      id: z.uuid().optional(),
      name: z.string().trim().min(1, C.nameRequired).max(60, C.nameRequired),
      icon: z.enum(EXPENSE_ICONS),
      isRecurring: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success) return failure(C.nameRequired, fieldErrorsOf(parsed.error));
  const { profile, supabase } = await admin();
  const row = { name: parsed.data.name, icon: parsed.data.icon, is_recurring: parsed.data.isRecurring };
  const { error } = parsed.data.id
    ? await supabase.from("expense_categories").update(row).eq("id", parsed.data.id)
    : await supabase.from("expense_categories").insert({ ...row, center_id: profile.centerId, sort_order: 100 });
  if (error) return failure(error.code === "23505" ? LABELS.admin.errors.duplicate : await describeCenterError(error));
  revalidateExpenses();
  return success();
}

export async function setExpenseCategoryActive(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const parsed = z.object({ id: z.uuid(), active: z.boolean() }).safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid);
  const { supabase } = await admin();
  const { error } = await supabase.from("expense_categories").update({ is_active: parsed.data.active }).eq("id", parsed.data.id);
  if (error) return failure(await describeCenterError(error));
  revalidateExpenses();
  return success();
}
