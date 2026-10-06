import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { toShellUser } from "@/components/layout/space-helpers";
import { requireRole } from "@/lib/auth/session";
import { getSessionBrand } from "@/lib/branding";
import { getLabels } from "@/lib/i18n/server";
import { formatLongDate } from "@/lib/format";

export default async function TeacherShellLayout({ children }: { children: ReactNode }) {
  const profile = await requireRole("teacher");
  const LABELS = await getLabels();
  const brand = await getSessionBrand();

  return (
    <AppShell
      space="teacher"
      user={toShellUser(profile, LABELS)}
      logoUrl={brand.logoUrl}
      whiteLabel={brand.whiteLabel}
      spaceLabel={LABELS.spaces.teacher}
      todayLabel={formatLongDate(new Date())}
    >
      {children}
    </AppShell>
  );
}
