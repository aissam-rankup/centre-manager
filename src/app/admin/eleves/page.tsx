import type { Metadata } from "next";

import { LABELS } from "@/lib/constants/labels";
import { getAdminStudents, getLevelOptions } from "@/lib/data/admin";

import { StudentsBoard } from "./students-board";

export const metadata: Metadata = { title: LABELS.admin.students.title };

export default async function AdminStudentsPage({ searchParams }: PageProps<"/admin/eleves">) {
  const { q, statut } = await searchParams;
  const [students, levels] = await Promise.all([getAdminStudents(), getLevelOptions()]);
  // « q » : recherche lancée depuis l'en-tête de l'application.
  const initialQuery = typeof q === "string" ? q : "";
  const initialStatus = statut === "retard" ? "overdue" : statut === "a-jour" ? "upToDate" : "";
  return (
    <StudentsBoard
      key={`${initialQuery}-${initialStatus}`}
      students={students}
      levels={levels}
      initialQuery={initialQuery}
      initialStatus={initialStatus}
    />
  );
}
