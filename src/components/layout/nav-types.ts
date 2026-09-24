import type { LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Actif uniquement sur l'URL exacte (pas sur les sous-pages). */
  exact?: boolean;
};

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.href) return true;
  return !item.exact && pathname.startsWith(`${item.href}/`);
}
