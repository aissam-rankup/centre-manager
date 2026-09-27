import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { toShellUser } from "@/components/layout/space-helpers";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole } from "@/lib/auth/session";
import { LABELS } from "@/lib/constants/labels";
import { formatLongDate } from "@/lib/format";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const profile = await requireRole("admin");

  return (
    <AppShell
      space="admin"
      user={toShellUser(profile)}
      spaceLabel={LABELS.spaces.admin}
      todayLabel={formatLongDate(new Date())}
      searchHref={ROUTES.admin.students}
    >
      {children}
    </AppShell>
  );
}
