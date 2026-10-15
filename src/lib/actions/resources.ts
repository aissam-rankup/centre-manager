"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, failure, success } from "@/lib/actions/result";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole } from "@/lib/auth/session";
import { describeCenterError, getLabels } from "@/lib/i18n/server";
import {
  detectResourceMime,
  RESOURCE_BUCKET,
  RESOURCE_MAX_BYTES,
  RESOURCE_TYPES,
  RESOURCE_TYPES_WITH_DUE_DATE,
  type ResourceMimeType,
  storedFileName,
} from "@/lib/resources";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type FieldErrors = Record<string, string>;

async function resourceSchema() {
  const V = (await getLabels()).resources.validation;
  return z.object({
    type: z.enum(RESOURCE_TYPES),
    /** « <matière>:<niveau> » parmi les affectations du professeur (revérifié par la RLS). */
    subject: z.string().regex(/^[0-9a-f-]{36}:[0-9a-f-]{36}$/i, V.subjectRequired),
    title: z.string().trim().min(1, V.titleRequired).max(150, V.titleTooLong),
    description: z.string().trim().max(2000, V.descriptionTooLong),
    dueDate: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, V.dueDateInvalid),
    publish: z.boolean(),
  });
}

export type ResourceInput = z.infer<Awaited<ReturnType<typeof resourceSchema>>>;

function fieldErrorsOf(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".");
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

/** Fichier envoyé : taille et contenu réel (PDF ou image), sinon un message. */
async function checkFile(file: File): Promise<{ mime: ResourceMimeType } | { error: string }> {
  const V = (await getLabels()).resources.validation;
  if (file.size === 0) return { error: V.fileRequired };
  if (file.size > RESOURCE_MAX_BYTES) return { error: V.fileTooLarge };
  const mime = detectResourceMime(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  return mime ? { mime } : { error: V.fileInvalid };
}

function parseForm(formData: FormData): { raw: unknown; file: File | null } {
  let raw: unknown = null;
  try {
    raw = JSON.parse(String(formData.get("data") ?? ""));
  } catch {
    raw = null;
  }
  const file = formData.get("file");
  return { raw, file: file instanceof File && file.size > 0 ? file : null };
}

function revalidateResources(id?: string) {
  revalidatePath(ROUTES.teacher.resources);
  if (id) revalidatePath(ROUTES.teacher.resource(id));
}

/** Champs de la ressource à écrire (l'échéance n'existe que pour un exercice ou un examen). */
function rowValues(values: ResourceInput) {
  const [subjectId = "", levelId = ""] = values.subject.split(":");
  return {
    type: values.type,
    subject_id: subjectId,
    level_id: levelId,
    title: values.title,
    description: values.description || null,
    due_date: RESOURCE_TYPES_WITH_DUE_DATE.includes(values.type) && values.dueDate ? values.dueDate : null,
  };
}

/**
 * Publie (ou enregistre en brouillon) une ressource : la ligne d'abord (la RLS
 * vérifie l'auteur, sa matière et son niveau, le module), puis le fichier dans
 * le dossier de la ressource, enfin le fichier rattaché.
 */
export async function createResource(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const LABELS = await getLabels();
  const { raw, file } = parseForm(formData);
  const parsed = (await resourceSchema()).safeParse(raw);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  if (!file) return failure(LABELS.resources.validation.fileRequired, { file: LABELS.resources.validation.fileRequired });
  const checked = await checkFile(file);
  if ("error" in checked) return failure(checked.error, { file: checked.error });

  const profile = await requireRole("teacher");
  if (!profile.modules.includes("lms")) return failure(LABELS.actions.errors.moduleDisabled);
  const supabase = await createClient();
  const id = crypto.randomUUID();

  const { error: insertError } = await supabase
    .from("learning_resources")
    .insert({ id, center_id: profile.centerId, author_id: profile.id, ...rowValues(parsed.data), is_published: false });
  if (insertError) return failure(await describeCenterError(insertError));

  const path = `${profile.centerId}/${id}/${storedFileName(file.name, checked.mime)}`;
  const { error: uploadError } = await supabase.storage.from(RESOURCE_BUCKET).upload(path, file, { contentType: checked.mime, upsert: false });
  if (uploadError) {
    await supabase.from("learning_resources").delete().eq("id", id);
    return failure(LABELS.resources.errors.upload);
  }

  const { error: updateError } = await supabase
    .from("learning_resources")
    .update({
      file_url: path,
      file_name: file.name.slice(0, 200),
      file_type: checked.mime,
      file_size: file.size,
      is_published: parsed.data.publish,
    })
    .eq("id", id);
  if (updateError) {
    await supabase.from("learning_resources").delete().eq("id", id);
    await createAdminClient().storage.from(RESOURCE_BUCKET).remove([path]);
    return failure(await describeCenterError(updateError));
  }

  revalidateResources();
  return success({ id });
}

/** Modifie une ressource ; un nouveau fichier remplace l'ancien (supprimé ensuite). */
export async function updateResource(formData: FormData): Promise<ActionResult> {
  const LABELS = await getLabels();
  const { raw, file } = parseForm(formData);
  const parsed = (await resourceSchema()).extend({ id: z.uuid() }).safeParse(raw);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid, fieldErrorsOf(parsed.error));
  const checked = file ? await checkFile(file) : null;
  if (checked && "error" in checked) return failure(checked.error, { file: checked.error });

  const profile = await requireRole("teacher");
  const supabase = await createClient();
  const { id, ...values } = parsed.data;

  const { data: current, error: readError } = await supabase
    .from("learning_resources")
    .select("file_url")
    .eq("id", id)
    .eq("author_id", profile.id)
    .maybeSingle();
  if (readError) return failure(await describeCenterError(readError));
  if (!current) return failure(LABELS.actions.errors.notFound);

  let replaced: { path: string; mime: ResourceMimeType } | null = null;
  if (file && checked && "mime" in checked) {
    // Nouveau nom : l'ancien fichier reste lisible jusqu'à l'enregistrement.
    const path = `${profile.centerId}/${id}/${Date.now()}-${storedFileName(file.name, checked.mime)}`;
    const { error: uploadError } = await supabase.storage.from(RESOURCE_BUCKET).upload(path, file, { contentType: checked.mime });
    if (uploadError) return failure(LABELS.resources.errors.upload);
    replaced = { path, mime: checked.mime };
  }

  const { error } = await supabase
    .from("learning_resources")
    .update({
      ...rowValues(values),
      is_published: values.publish,
      ...(replaced && file
        ? { file_url: replaced.path, file_name: file.name.slice(0, 200), file_type: replaced.mime, file_size: file.size }
        : {}),
    })
    .eq("id", id);
  if (error) {
    if (replaced) await supabase.storage.from(RESOURCE_BUCKET).remove([replaced.path]);
    return failure(await describeCenterError(error));
  }
  if (replaced && current.file_url) await supabase.storage.from(RESOURCE_BUCKET).remove([current.file_url]);

  revalidateResources(id);
  return success();
}

/** Publie ou dépublie (les élèves ne voient que les ressources publiées). */
export async function setResourcePublished(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const parsed = z.object({ id: z.uuid(), published: z.boolean() }).safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid);
  const profile = await requireRole("teacher");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("learning_resources")
    .update({ is_published: parsed.data.published })
    .eq("id", parsed.data.id)
    .eq("author_id", profile.id)
    .select("id");
  if (error) return failure(await describeCenterError(error));
  if (data.length === 0) return failure(LABELS.actions.errors.notFound);
  revalidateResources(parsed.data.id);
  return success();
}

/**
 * Supprime une ressource et son fichier. La RLS n'autorise la suppression qu'à
 * l'auteur ; le fichier est ensuite retiré côté serveur (la ligne qui donnait
 * le droit d'écrire dans son dossier n'existe plus).
 */
export async function deleteResource(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid);
  const profile = await requireRole("teacher");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("learning_resources")
    .delete()
    .eq("id", parsed.data.id)
    .eq("author_id", profile.id)
    .select("id, center_id, file_url");
  if (error) return failure(await describeCenterError(error));
  const deleted = data[0];
  if (!deleted) return failure(LABELS.actions.errors.notFound);
  // Uniquement un fichier du dossier de cette ressource (la base l'impose aussi).
  if (deleted.file_url?.startsWith(`${deleted.center_id}/${deleted.id}/`)) {
    await createAdminClient().storage.from(RESOURCE_BUCKET).remove([deleted.file_url]);
  }
  revalidateResources();
  return success();
}
