import type { Metadata } from "next";
import type { ReactNode } from "react";

import { BrandStyle } from "@/components/layout/brand-style";

import { requireRole } from "@/lib/auth/session";
import { brandMetadata, getSessionBrand } from "@/lib/branding";
import { LabelsProvider } from "@/lib/i18n/client";

/** Onglet et favicon à la marque du centre (marque blanche). */
export async function generateMetadata(): Promise<Metadata> {
  return brandMetadata(await getSessionBrand());
}

// Garde de l'espace professeur. La coque applicative est dans (shell) :
// le mode appel (phase 5) s'affiche en plein écran, hors de ce groupe.
export default async function TeacherLayout({ children }: { children: ReactNode }) {
  const profile = await requireRole("teacher");
  const brand = await getSessionBrand();
  return (
    <LabelsProvider terms={profile.vocabulary} brandName={brand.whiteLabel ? brand.name : null}>
      <BrandStyle brand={brand} />
      {children}
    </LabelsProvider>
  );
}
