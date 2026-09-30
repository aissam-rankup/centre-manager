import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import type { ReactNode } from "react";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { brandMetadata, getDocumentBrand } from "@/lib/branding";
import { LABELS } from "@/lib/constants/labels";

import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const PLATFORM_METADATA: Metadata = {
  title: {
    default: LABELS.app.name,
    template: `%s · ${LABELS.app.name}`,
  },
  description: LABELS.app.metaDescription,
};

/** Onglet et favicon : marque du centre (marque blanche) de l'adresse ou du compte, sinon la plateforme. */
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getDocumentBrand();
  return brand.whiteLabel ? { ...PLATFORM_METADATA, ...brandMetadata(brand) } : PLATFORM_METADATA;
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eaf1fc" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0a1d" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr" className={poppins.variable} suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster position="top-center" closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
