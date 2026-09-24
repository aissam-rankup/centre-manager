import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { toShellUser } from "@/components/layout/space-helpers";
import { requireRole } from "@/lib/auth/session";
import { LABELS } from "@/lib/constants/labels";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const profile = await requireRole("admin");

  return (
    <AppShell space="admin" user={toShellUser(profile)} spaceLabel={LABELS.spaces.admin}>
      {children}
    </AppShell>
  );
}
