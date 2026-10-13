import type { Metadata } from "next";

import { requireRole } from "@/lib/auth/session";
import { getLabels } from "@/lib/i18n/server";
import { getUsers } from "@/lib/data/admin";
import { getLevelsWithSubjects } from "@/lib/data/assistant";

import { UsersBoard } from "./users-board";

export async function generateMetadata(): Promise<Metadata> {
  const LABELS = await getLabels();
  return { title: LABELS.admin.users.title };
}

export default async function AdminUsersPage() {
  const [profile, users, levels] = await Promise.all([requireRole("admin"), getUsers(), getLevelsWithSubjects()]);
  // Lien vers la rémunération : module Finance, hors mode support (la paie n'y est pas consultable).
  const payrollEnabled = profile.modules.includes("finance") && !profile.support;
  return <UsersBoard users={users} levels={levels} payrollEnabled={payrollEnabled} />;
}
