import type { LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  /** Libellé court pour la barre de navigation mobile (13 caractères environ). */
  shortLabel?: string;
  icon: LucideIcon;
};

/**
 * Entrée active : celle dont le chemin correspond le plus précisément à l'URL.
 * « /assistant/eleves/nouveau » active « Nouvel élève » et non « Élèves » ;
 * une fiche « /assistant/eleves/123 » active « Élèves ».
 */
export function findActiveHref(items: readonly NavItem[], pathname: string): string | null {
  let best: string | null = null;
  for (const { href } of items) {
    const matches = pathname === href || pathname.startsWith(`${href}/`);
    if (matches && (best === null || href.length > best.length)) best = href;
  }
  return best;
}
