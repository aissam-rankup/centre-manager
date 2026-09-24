import { Component, LayoutPanelTop, Palette } from "lucide-react";

import type { NavItem } from "@/components/layout/nav-types";
import { LABELS } from "@/lib/constants/labels";

/**
 * Entrées de navigation par espace.
 * Les espaces assistant, professeur et admin sont ajoutés en phase 3.
 */
export type NavSpace = "styleguide";

export const NAVIGATION: Record<NavSpace, readonly NavItem[]> = {
  styleguide: [
    { href: "/charte", label: LABELS.nav.styleguideTokens, icon: Palette, exact: true },
    { href: "/charte/composants", label: LABELS.nav.styleguideComponents, icon: Component },
    { href: "/charte/etats", label: LABELS.nav.styleguideStates, icon: LayoutPanelTop },
  ],
};
