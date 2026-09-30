import type { Metadata } from "next";

import { getLabels } from "@/lib/i18n/server";
import { getUsers } from "@/lib/data/admin";
import { getLevelsWithSubjects } from "@/lib/data/assistant";

import { UsersBoard } from "./users-board";

export async function generateMetadata(): Promise<Metadata> {
  const LABELS = await getLabels();
  return { title: LABELS.admin.users.title };
}

export default async function AdminUsersPage() {
  const [users, levels] = await Promise.all([getUsers(), getLevelsWithSubjects()]);
  return <UsersBoard users={users} levels={levels} />;
}
