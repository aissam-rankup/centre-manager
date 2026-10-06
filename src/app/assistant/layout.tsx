import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { BrandStyle } from "@/components/layout/brand-style";
import { toShellUser } from "@/components/layout/space-helpers";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole } from "@/lib/auth/session";
import { brandMetadata, getSessionBrand } from "@/lib/branding";
import { LabelsProvider } from "@/lib/i18n/client";
import { ModulesProvider } from "@/lib/modules-client";
import { getLabels } from "@/lib/i18n/server";
import { getNotifications } from "@/lib/data/notifications";
import { hasReenrollment } from "@/lib/data/reenrollment";
import { formatLongDate } from "@/lib/format";

/** Onglet et favicon à la marque du centre (marque blanche). */
export async function generateMetadata(): Promise<Metadata> {
  return brandMetadata(await getSessionBrand());
}

export default async function AssistantLayout({ children }: { children: ReactNode }) {
  const profile = await requireRole("assistant");
  const LABELS = await getLabels();
  const brand = await getSessionBrand();
  const [notifications, reenrollment] = await Promise.all([getNotifications(), hasReenrollment()]);

  return (
    <LabelsProvider terms={profile.vocabulary} brandName={brand.whiteLabel ? brand.name : null}>
      <ModulesProvider modules={profile.modules}>
        <BrandStyle brand={brand} />
        <AppShell
          space="assistant"
          user={toShellUser(profile, LABELS)}
          logoUrl={brand.logoUrl}
          whiteLabel={brand.whiteLabel}
          reenrollment={reenrollment}
          spaceLabel={LABELS.spaces.assistant}
          todayLabel={formatLongDate(new Date())}
          searchHref={ROUTES.assistant.students}
          notifications={{ items: notifications, fileBase: ROUTES.assistant.students }}
        >
          {children}
        </AppShell>
      </ModulesProvider>
    </LabelsProvider>
  );
}
