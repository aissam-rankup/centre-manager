import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { toShellUser } from "@/components/layout/space-helpers";
import { requireRole } from "@/lib/auth/session";
import { LABELS } from "@/lib/constants/labels";

export default async function TeacherShellLayout({ children }: { children: ReactNode }) {
  const profile = await requireRole("teacher");

  return (
    <AppShell space="teacher" user={toShellUser(profile)} spaceLabel={LABELS.spaces.teacher}>
      {children}
    </AppShell>
  );
}
