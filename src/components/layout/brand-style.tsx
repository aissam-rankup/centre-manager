import { type Brand, brandCss } from "@/lib/branding";

/** Couleurs de la marque du centre (marque blanche), rendues côté serveur. */
export function BrandStyle({ brand }: { brand: Brand }) {
  const css = brandCss(brand);
  if (!css) return null;
  // Rendue dans le corps de la page, après la feuille globale : elle la surcharge à spécificité égale.
  return <style>{css}</style>;
}
