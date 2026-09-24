import { Palette } from "lucide-react";

import type { NavItem } from "@/components/layout/nav-types";
import { LABELS } from "@/lib/constants/labels";

/**
 * Espaces de navigation. Les espaces assistant, professeur et admin
 * seront ajoutés en phase 3.
 */
export type NavSpace = "styleguide";

export const NAVIGATION: Record<NavSpace, readonly NavItem[]> = {
  styleguide: [{ href: "/charte", label: LABELS.nav.styleguide, icon: Palette }],
};
