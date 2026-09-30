import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { toShellUser } from "@/components/layout/space-helpers";
import { requireSuperAdmin } from "@/lib/auth/session";
import { LABELS, labelsFor } from "@/lib/constants/labels";
import { formatLongDate } from "@/lib/format";

// Console toujours à la marque de la plateforme, jamais indexée.
export const metadata: Metadata = {
  title: { template: `%s · ${LABELS.platform.brand}`, default: labelsFor().spaces.platform },
  robots: { index: false, follow: false },
};

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const profile = await requireSuperAdmin();
  const labels = labelsFor();

  return (
    <AppShell
      space="platform"
      user={{ ...toShellUser(profile, labels), centerName: LABELS.platform.brand, canEditPhoto: false }}
      spaceLabel={labels.spaces.platform}
      todayLabel={formatLongDate(new Date())}
    >
      {children}
    </AppShell>
  );
}
