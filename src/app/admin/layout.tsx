import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { SpaceBanners } from "@/components/layout/space-banners";
import { toShellUser } from "@/components/layout/space-helpers";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole } from "@/lib/auth/session";
import { LabelsProvider } from "@/lib/i18n/client";
import { getLabels } from "@/lib/i18n/server";
import { getNotifications } from "@/lib/data/notifications";
import { formatLongDate } from "@/lib/format";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const profile = await requireRole("admin");
  const LABELS = await getLabels();
  const notifications = await getNotifications();

  return (
    <LabelsProvider terms={profile.vocabulary}>
      <AppShell
        space="admin"
        user={toShellUser(profile, LABELS)}
        spaceLabel={LABELS.spaces.admin}
        todayLabel={formatLongDate(new Date())}
        searchHref={ROUTES.admin.students}
        notifications={{ items: notifications, fileBase: ROUTES.admin.students }}
        banners={<SpaceBanners profile={profile} />}
      >
        {children}
      </AppShell>
    </LabelsProvider>
  );
}
