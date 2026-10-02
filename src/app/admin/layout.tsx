import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { BrandStyle } from "@/components/layout/brand-style";
import { SpaceBanners } from "@/components/layout/space-banners";
import { toShellUser } from "@/components/layout/space-helpers";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole } from "@/lib/auth/session";
import { brandMetadata, getSessionBrand } from "@/lib/branding";
import { LabelsProvider } from "@/lib/i18n/client";
import { getLabels } from "@/lib/i18n/server";
import { getNotifications } from "@/lib/data/notifications";
import { hasReenrollment } from "@/lib/data/reenrollment";
import { formatLongDate } from "@/lib/format";

/** Onglet et favicon à la marque du centre (marque blanche). */
export async function generateMetadata(): Promise<Metadata> {
  return brandMetadata(await getSessionBrand());
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const profile = await requireRole("admin");
  const LABELS = await getLabels();
  const brand = await getSessionBrand();
  const [notifications, reenrollment] = await Promise.all([getNotifications(), hasReenrollment()]);

  return (
    <LabelsProvider terms={profile.vocabulary} brandName={brand.whiteLabel ? brand.name : null}>
      <BrandStyle brand={brand} />
      <AppShell
        space="admin"
        user={toShellUser(profile, LABELS)}
        logoUrl={brand.logoUrl}
        reenrollment={reenrollment}
        brandingEditable={profile.plan === "white_label" && !profile.support}
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
