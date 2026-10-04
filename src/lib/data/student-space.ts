import "server-only";

import { requireStudent } from "@/lib/auth/session";
import { today, toISODate } from "@/lib/format";
import type { ResourceType } from "@/lib/resources";
import { createClient } from "@/lib/supabase/server";

export type StudentResource = {
  id: string;
  type: ResourceType;
  title: string;
  description: string | null;
  subjectId: string;
  subjectName: string;
  levelName: string;
  authorName: string | null;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  publishedAt: string | null;
  dueDate: string | null;
  /** Jours avant l'échéance (négatif : passée), null sans échéance. */
  dueInDays: number | null;
  isNew: boolean;
};

export type StudentSpace = {
  resources: StudentResource[];
  /** Matières où au moins une ressource est publiée, triées. */
  subjects: { id: string; name: string }[];
  /** Ressources à rendre aujourd'hui ou plus tard, les plus proches d'abord. */
  upcoming: StudentResource[];
  newCount: number;
};

function daysBetween(fromIso: string, toIso: string): number {
  const [fy = 0, fm = 1, fd = 1] = fromIso.split("-").map(Number);
  const [ty = 0, tm = 1, td = 1] = toIso.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** Ressources publiées des matières de l'élève connecté (la base filtre : inscription active, module, publication). */
export async function getStudentSpace(): Promise<StudentSpace> {
  await requireStudent();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_resources");
  if (error) throw error;
  const todayIso = toISODate(today());

  const resources: StudentResource[] = data.map((row) => ({
    id: row.resource_id,
    type: row.type,
    title: row.title,
    description: row.description,
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    levelName: row.level_name,
    authorName: row.author_name,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: row.file_size,
    publishedAt: row.published_at,
    dueDate: row.due_date,
    dueInDays: row.due_date ? daysBetween(todayIso, row.due_date) : null,
    isNew: row.is_new,
  }));

  const subjects = [...new Map(resources.map((resource) => [resource.subjectId, resource.subjectName] as const)).entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const upcoming = resources
    .filter((resource) => resource.dueInDays !== null && resource.dueInDays >= 0)
    .sort((a, b) => (a.dueInDays ?? 0) - (b.dueInDays ?? 0));

  return { resources, subjects, upcoming, newCount: resources.filter((resource) => resource.isNew).length };
}
