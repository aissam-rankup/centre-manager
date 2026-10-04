import { requireModule, requireStaff } from "@/lib/auth/session";
import { getSessionBrand } from "@/lib/branding";
import { LabelsProvider } from "@/lib/i18n/client";
import { ModulesProvider } from "@/lib/modules-client";

/** Reçus imprimables : sans menu ni barre latérale, vocabulaire du centre. */
export default async function ReceiptsLayout({ children }: LayoutProps<"/recus">) {
  const profile = await requireStaff();
  requireModule(profile, "finance");
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
