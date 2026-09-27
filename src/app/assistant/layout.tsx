import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { toShellUser } from "@/components/layout/space-helpers";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole } from "@/lib/auth/session";
import { LABELS } from "@/lib/constants/labels";
import { formatLongDate } from "@/lib/format";

export default async function AssistantLayout({ children }: { children: ReactNode }) {
  const profile = await requireRole("assistant");

  return (
    <AppShell
      space="assistant"
      user={toShellUser(profile)}
      spaceLabel={LABELS.spaces.assistant}
      todayLabel={formatLongDate(new Date())}
      searchHref={ROUTES.assistant.students}
    >
      {children}
    </AppShell>
  );
}
