import type { Metadata } from "next";

import { LABELS } from "@/lib/constants/labels";
import { getAdminStudents, getLevelOptions } from "@/lib/data/admin";

import { StudentsBoard } from "./students-board";

export const metadata: Metadata = { title: LABELS.admin.students.title };

export default async function AdminStudentsPage() {
  const [students, levels] = await Promise.all([getAdminStudents(), getLevelOptions()]);
  return <StudentsBoard students={students} levels={levels} />;
}
