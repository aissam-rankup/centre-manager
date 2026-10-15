import type { MetadataRoute } from "next";

import { getDocumentBrand } from "@/lib/branding";
import { LABELS } from "@/lib/constants/labels";

/**
 * Application installable : dirassty, ou le centre en marque blanche (nom et favicon du centre,
 * jamais les icônes de la plateforme).
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const brand = await getDocumentBrand();
  const base = {
    start_url: "/",
    display: "standalone" as const,
    background_color: "#FFFFFF",
    theme_color: brand.colors.primary ?? "#6C2BF5",
  };

  if (brand.whiteLabel) {
    return {
      ...base,
      name: brand.name,
      short_name: brand.name,
      icons: brand.faviconUrl ? [{ src: brand.faviconUrl, sizes: "any" }] : [],
    };
  }
  return {
    ...base,
    name: LABELS.app.name,
    short_name: LABELS.app.name,
    description: LABELS.app.metaDescription,
    lang: "fr",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
