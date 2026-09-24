import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { toShellUser } from "@/components/layout/space-helpers";
import { requireRole } from "@/lib/auth/session";
import { LABELS } from "@/lib/constants/labels";

export default async function AssistantLayout({ children }: { children: ReactNode }) {
  const profile = await requireRole("assistant");

  return (
    <AppShell space="assistant" user={toShellUser(profile)} spaceLabel={LABELS.spaces.assistant}>
      {children}
    </AppShell>
  );
}
