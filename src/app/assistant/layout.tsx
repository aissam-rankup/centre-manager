import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { toShellUser } from "@/components/layout/space-helpers";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole } from "@/lib/auth/session";
import { LabelsProvider } from "@/lib/i18n/client";
import { getLabels } from "@/lib/i18n/server";
import { getNotifications } from "@/lib/data/notifications";
import { formatLongDate } from "@/lib/format";

export default async function AssistantLayout({ children }: { children: ReactNode }) {
  const profile = await requireRole("assistant");
  const LABELS = await getLabels();
  const notifications = await getNotifications();

  return (
    <LabelsProvider terms={profile.vocabulary}>
      <AppShell
        space="assistant"
        user={toShellUser(profile, LABELS)}
        spaceLabel={LABELS.spaces.assistant}
        todayLabel={formatLongDate(new Date())}
        searchHref={ROUTES.assistant.students}
        notifications={{ items: notifications, fileBase: ROUTES.assistant.students }}
      >
        {children}
      </AppShell>
    </LabelsProvider>
  );
}
