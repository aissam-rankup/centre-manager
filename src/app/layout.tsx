import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import type { ReactNode } from "react";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { brandMetadata, getDocumentBrand } from "@/lib/branding";
import { getRootUrl } from "@/lib/center-host";
import { LABELS } from "@/lib/constants/labels";

import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const OG_IMAGE = { url: "/brand/og-image.png", width: 1200, height: 630, alt: LABELS.app.name };

/** Domaine racine (ROOT_DOMAIN) : base des adresses absolues des aperçus, jamais un domaine en dur. */
function metadataBase(): URL | undefined {
  try {
    return new URL(getRootUrl("/"));
  } catch {
    return undefined;
  }
}

const PLATFORM_METADATA: Metadata = {
  metadataBase: metadataBase(),
  title: {
    default: LABELS.app.name,
    template: `%s · ${LABELS.app.name}`,
  },
  description: LABELS.app.metaDescription,
  applicationName: LABELS.app.name,
  // Icônes déclarées ici (et non par les conventions de fichiers, qui l'emporteraient sur la favicon
  // d'un centre en marque blanche).
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/brand/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    siteName: LABELS.app.name,
    title: LABELS.app.name,
    description: LABELS.app.metaDescription,
    locale: "fr_FR",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: LABELS.app.name,
    description: LABELS.app.metaDescription,
    images: [OG_IMAGE.url],
  },
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
  themeColor: "#6C2BF5",
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
