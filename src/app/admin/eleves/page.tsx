import type { Metadata } from "next";

import { LABELS } from "@/lib/constants/labels";
import { getAdminStudents, getLevelOptions } from "@/lib/data/admin";

import { StudentsBoard } from "./students-board";

export const metadata: Metadata = { title: LABELS.admin.students.title };

export default async function AdminStudentsPage({ searchParams }: PageProps<"/admin/eleves">) {
  const { q } = await searchParams;
  const [students, levels] = await Promise.all([getAdminStudents(), getLevelOptions()]);
  // « q » : recherche lancée depuis l'en-tête de l'application.
  const initialQuery = typeof q === "string" ? q : "";
  return <StudentsBoard key={initialQuery} students={students} levels={levels} initialQuery={initialQuery} />;
}
