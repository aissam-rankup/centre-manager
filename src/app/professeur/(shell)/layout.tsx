import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { toShellUser } from "@/components/layout/space-helpers";
import { requireRole } from "@/lib/auth/session";
import { getLabels } from "@/lib/i18n/server";
import { formatLongDate } from "@/lib/format";

export default async function TeacherShellLayout({ children }: { children: ReactNode }) {
  const profile = await requireRole("teacher");
  const LABELS = await getLabels();

  return (
    <AppShell
      space="teacher"
      user={toShellUser(profile, LABELS)}
      spaceLabel={LABELS.spaces.teacher}
      todayLabel={formatLongDate(new Date())}
    >
      {children}
    </AppShell>
  );
}
