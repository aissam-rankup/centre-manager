import "server-only";

import { requireModule, requireRole } from "@/lib/auth/session";
import type { ResourceType } from "@/lib/resources";
import { createClient } from "@/lib/supabase/server";

/** Matière et niveau enseignés par le professeur connecté. */
export type TeachingOption = { subjectId: string; levelId: string; label: string };

export type TeacherResource = {
  id: string;
  type: ResourceType;
  title: string;
  description: string | null;
  subjectId: string;
  levelId: string;
  subjectName: string;
  levelName: string;
  fileName: string | null;
  fileSize: number | null;
  hasFile: boolean;
  isPublished: boolean;
  publishedAt: string | null;
  dueDate: string | null;
  updatedAt: string;
};

async function teacherClient() {
  const profile = await requireRole("teacher");
  requireModule(profile, "lms");
  return { profile, supabase: await createClient() };
}

/** Matières et niveaux du professeur (affectations), pour publier une ressource. */
export async function getTeachingOptions(): Promise<TeachingOption[]> {
  const { profile, supabase } = await teacherClient();
  const { data, error } = await supabase.from("teacher_assignments").select("subject_id, level_id").eq("teacher_id", profile.id);
  if (error) throw error;
  const [names, levels] = await Promise.all([
    subjectNamesOf(supabase, data.map((row) => row.subject_id)),
    supabase.from("levels").select("id, name"),
  ]);
  if (levels.error) throw levels.error;
  const levelNames = new Map(levels.data.map((level) => [level.id, level.name] as const));
  return data
    .map((row) => ({
      subjectId: row.subject_id,
      levelId: row.level_id,
      label: `${names.get(row.subject_id) ?? ""} · ${levelNames.get(row.level_id) ?? ""}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

const COLUMNS =
  "id, type, title, description, subject_id, level_id, file_url, file_name, file_size, is_published, published_at, due_date, updated_at, levels(name)";

type ResourceRow = {
  id: string;
  type: ResourceType;
  title: string;
  description: string | null;
  subject_id: string;
  level_id: string;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  is_published: boolean;
  published_at: string | null;
  due_date: string | null;
  updated_at: string;
  levels: { name: string } | null;
};

function toResource(row: ResourceRow, subjectNames: Map<string, string>): TeacherResource {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    subjectId: row.subject_id,
    levelId: row.level_id,
    subjectName: subjectNames.get(row.subject_id) ?? "",
    levelName: row.levels?.name ?? "",
    fileName: row.file_name,
    fileSize: row.file_size,
    hasFile: row.file_url !== null,
    isPublished: row.is_published,
    publishedAt: row.published_at,
    dueDate: row.due_date,
    updatedAt: row.updated_at,
  };
}

async function subjectNamesOf(supabase: Awaited<ReturnType<typeof createClient>>, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from("subject_catalog").select("id, name").in("id", [...new Set(ids)]);
  if (error) throw error;
  return new Map(data.flatMap((subject) => (subject.id && subject.name ? [[subject.id, subject.name] as const] : [])));
}

/** Ressources du professeur connecté (la RLS ne renvoie que les siennes), les plus récentes d'abord. */
export async function getMyResources(): Promise<TeacherResource[]> {
  const { profile, supabase } = await teacherClient();
  const { data, error } = await supabase
    .from("learning_resources")
    .select(COLUMNS)
    .eq("author_id", profile.id)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const names = await subjectNamesOf(supabase, data.map((row) => row.subject_id));
  return data.map((row) => toResource(row, names));
}

export async function getMyResource(id: string): Promise<TeacherResource | null> {
  const { profile, supabase } = await teacherClient();
  const { data, error } = await supabase
    .from("learning_resources")
    .select(COLUMNS)
    .eq("id", id)
    .eq("author_id", profile.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toResource(data, await subjectNamesOf(supabase, [data.subject_id]));
}
