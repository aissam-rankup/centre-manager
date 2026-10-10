import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Logo as DirasstyLogo } from "@/components/brand/logo";
import { PoweredBy } from "@/components/brand/powered-by";
import { AppLanguageSwitcher } from "@/components/layout/app-language-switcher";
import { BrandStyle } from "@/components/layout/brand-style";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { brandMetadata, getCurrentCenter, getPublicBrand } from "@/lib/branding";
import { getLabels } from "@/lib/i18n/server";

/** Connexion et invitation : marque du centre désigné par l'adresse (marque blanche). */
export async function generateMetadata(): Promise<Metadata> {
  return brandMetadata(await getPublicBrand());
}

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const [brand, center, LABELS] = await Promise.all([getPublicBrand(), getCurrentCenter(), getLabels()]);

  // Domaine racine (aucun centre désigné) : écran aux couleurs de dirassty.
  if (!center && !brand.whiteLabel) {
    return (
      <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[5fr_6fr]">
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex">
          <DirasstyLogo tone="white" height={44} priority />
          <p className="relative z-10 max-w-sm text-4xl leading-tight font-semibold tracking-tight">{LABELS.app.tagline}</p>
          <DirasstyLogo
            variant="mark"
            tone="white"
            height={460}
            decorative
            className="pointer-events-none absolute -end-20 -bottom-24 opacity-10"
          />
        </aside>
        <div className="flex min-h-dvh flex-col">
          <header className="flex h-16 items-center justify-between bg-sidebar px-4 text-sidebar-foreground lg:bg-transparent lg:px-6 lg:text-foreground">
            <DirasstyLogo tone="white" height={28} priority className="lg:hidden" />
            <span className="hidden lg:block" />
            <div className="flex items-center gap-2">
              <AppLanguageSwitcher />
              <div className="[&_button]:text-inherit">
                <ThemeToggle />
              </div>
            </div>
          </header>
          <main className="flex flex-1 items-start justify-center px-4 pt-8 pb-16 sm:items-center sm:pt-0">{children}</main>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-dvh flex-col bg-background bg-cover bg-center"
      style={brand.loginBackgroundUrl ? { backgroundImage: `url("${encodeURI(brand.loginBackgroundUrl)}")` } : undefined}
    >
      <BrandStyle brand={brand} />
      <header className="flex h-16 items-center justify-between px-4 md:px-6">
        <Logo name={brand.name} logoUrl={brand.logoUrl} whiteLabel={brand.whiteLabel} priority />
        <div className="flex items-center gap-2">
          <AppLanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-8 pb-16 sm:items-center sm:pt-0">{children}</main>
      {brand.whiteLabel ? null : (
        <footer className="flex justify-center px-4 pb-6">
          <PoweredBy />
        </footer>
      )}
    </div>
  );
}
