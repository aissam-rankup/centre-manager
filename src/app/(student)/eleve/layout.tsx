import { KeyRound, LogOut } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/components/shared/app-link";
import type { ReactNode } from "react";

import { PoweredBy } from "@/components/brand/powered-by";
import { AppLanguageSwitcher } from "@/components/layout/app-language-switcher";
import { BrandStyle } from "@/components/layout/brand-style";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/auth/routes";
import { requireStudent } from "@/lib/auth/session";
import { signOutStudent } from "@/lib/auth/student-actions";
import { brandMetadata, getSessionBrand } from "@/lib/branding";
import { LabelsProvider } from "@/lib/i18n/client";
import { getLabels } from "@/lib/i18n/server";

/** Onglet et favicon à la marque du centre de l'élève. */
export async function generateMetadata(): Promise<Metadata> {
  return brandMetadata(await getSessionBrand());
}

/**
 * Espace élève : séparé des trois espaces de l'équipe, à la marque du centre.
 * Garde : accès élève actif, centre en service, plateforme pédagogique incluse.
 */
export default async function StudentLayout({ children }: { children: ReactNode }) {
  const student = await requireStudent();
  const [brand, LABELS] = await Promise.all([getSessionBrand(), getLabels()]);

  return (
    <LabelsProvider terms={student.vocabulary} brandName={brand.whiteLabel ? brand.name : null}>
      <BrandStyle brand={brand} />
      <div className="flex min-h-dvh flex-col bg-background">
        <header className="flex h-16 items-center justify-between gap-3 border-b border-divider px-4 md:px-6">
          <Logo name={brand.name} logoUrl={brand.logoUrl} whiteLabel={brand.whiteLabel} />
          <div className="flex items-center gap-2">
            <AppLanguageSwitcher compact className="sm:hidden" />
            <AppLanguageSwitcher className="hidden sm:inline-flex" />
            <ThemeToggle />
            <Button asChild variant="ghost" aria-label={LABELS.passwords.mine.menu}>
              <Link href={ROUTES.myPassword}>
                <KeyRound aria-hidden />
                <span className="hidden sm:inline">{LABELS.passwords.mine.menu}</span>
              </Link>
            </Button>
            <form action={signOutStudent}>
              <Button type="submit" variant="ghost">
                <LogOut aria-hidden />
                <span className="hidden sm:inline">{LABELS.studentSpace.signOut}</span>
              </Button>
            </form>
          </div>
        </header>
        <main id="contenu" className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 md:px-6">
          {children}
        </main>
        {brand.whiteLabel ? null : (
          <footer className="flex justify-center px-4 pb-6">
            <PoweredBy />
          </footer>
        )}
      </div>
    </LabelsProvider>
  );
}
