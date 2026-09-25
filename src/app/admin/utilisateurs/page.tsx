import type { Metadata } from "next";

import { LABELS } from "@/lib/constants/labels";
import { getUsers } from "@/lib/data/admin";
import { getLevelsWithSubjects } from "@/lib/data/assistant";

import { UsersBoard } from "./users-board";

export const metadata: Metadata = { title: LABELS.admin.users.title };

export default async function AdminUsersPage() {
  const [users, levels] = await Promise.all([getUsers(), getLevelsWithSubjects()]);
  return <UsersBoard users={users} levels={levels} />;
}
