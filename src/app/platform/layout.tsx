import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { toShellUser } from "@/components/layout/space-helpers";
import { requireSuperAdmin } from "@/lib/auth/session";
import { formatLongDate } from "@/lib/format";
import { getAppLocale } from "@/lib/i18n/request-locale";
import { getLabels } from "@/lib/i18n/server";

// Console toujours à la marque de la plateforme, jamais indexée.
export async function generateMetadata(): Promise<Metadata> {
  const LABELS = await getLabels();
  return {
    title: { template: `%s · ${LABELS.platform.brand}`, default: LABELS.spaces.platform },
    robots: { index: false, follow: false },
  };
}

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const profile = await requireSuperAdmin();
  const labels = await getLabels();
  const locale = await getAppLocale();

  return (
    <AppShell
      space="platform"
      user={{ ...toShellUser(profile, labels), centerName: labels.platform.brand, canEditPhoto: false }}
      spaceLabel={labels.spaces.platform}
      todayLabel={formatLongDate(new Date(), locale)}
    >
      {children}
    </AppShell>
  );
}
