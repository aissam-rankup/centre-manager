import type { Metadata } from "next";
import type { ReactNode } from "react";

import { BrandStyle } from "@/components/layout/brand-style";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { brandMetadata, getPublicBrand } from "@/lib/branding";

/** Connexion et invitation : marque du centre désigné par l'adresse (marque blanche). */
export async function generateMetadata(): Promise<Metadata> {
  return brandMetadata(await getPublicBrand());
}

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const brand = await getPublicBrand();

  return (
    <div
      className="flex min-h-dvh flex-col bg-background bg-cover bg-center"
      style={brand.loginBackgroundUrl ? { backgroundImage: `url("${encodeURI(brand.loginBackgroundUrl)}")` } : undefined}
    >
      <BrandStyle brand={brand} />
      <header className="flex h-16 items-center justify-between px-4 md:px-6">
        <Logo name={brand.name} logoUrl={brand.logoUrl} />
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-8 pb-16 sm:items-center sm:pt-0">{children}</main>
    </div>
  );
}
