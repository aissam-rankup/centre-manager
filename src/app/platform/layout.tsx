import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { toShellUser } from "@/components/layout/space-helpers";
import { requireSuperAdmin } from "@/lib/auth/session";
import { LABELS } from "@/lib/constants/labels";
import { formatLongDate } from "@/lib/format";

// Console toujours à la marque de la plateforme, jamais indexée.
export const metadata: Metadata = {
  title: { template: `%s · ${LABELS.platform.brand}`, default: LABELS.spaces.platform },
  robots: { index: false, follow: false },
};

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const profile = await requireSuperAdmin();

  return (
    <AppShell
      space="platform"
      user={{ ...toShellUser(profile), centerName: LABELS.platform.brand, canEditPhoto: false }}
      spaceLabel={LABELS.spaces.platform}
      todayLabel={formatLongDate(new Date())}
    >
      {children}
    </AppShell>
  );
}
