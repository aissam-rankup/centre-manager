import { notFound } from "next/navigation";

import { requireModule, requireRole } from "@/lib/auth/session";
import { getSessionBrand } from "@/lib/branding";
import { LabelsProvider } from "@/lib/i18n/client";
import { ModulesProvider } from "@/lib/modules-client";

/** Reçus de paie imprimables : admin du centre uniquement (jamais en mode support), sans menu. */
export default async function SalaryReceiptsLayout({ children }: LayoutProps<"/recus-paie">) {
  const profile = await requireRole("admin");
  requireModule(profile, "finance");
  if (profile.support) notFound();
  const brand = await getSessionBrand();
  return (
    <LabelsProvider terms={profile.vocabulary} brandName={brand.whiteLabel ? brand.name : null}>
      <ModulesProvider modules={profile.modules}>
        <main id="contenu" className="min-h-dvh bg-muted px-4 py-6 print:bg-white print:p-0">
          {children}
        </main>
      </ModulesProvider>
    </LabelsProvider>
  );
}
