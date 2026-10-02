import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarX,
  CalendarDays,
  CalendarRange,
  Component,
  GraduationCap,
  HandCoins,
  House,
  LayoutDashboard,
  LayoutPanelTop,
  Palette,
  ReceiptText,
  Settings,
  UserPlus,
  Users,
  UserCog,
  Wallet,
} from "lucide-react";

import type { NavItem } from "@/components/layout/nav-types";
import { ROUTES } from "@/lib/auth/routes";
import type { AppLabels } from "@/lib/constants/labels";

export type NavSpace = "assistant" | "teacher" | "admin" | "platform" | "styleguide";

/** Entrées de navigation, dans le vocabulaire du centre. */
export function navigationFor(
  LABELS: AppLabels,
  options: { brandingEditable?: boolean } = {},
): Record<NavSpace, readonly NavItem[]> {
  return {
    assistant: [
      { href: ROUTES.assistant.home, label: LABELS.nav.dashboard, shortLabel: LABELS.nav.short.dashboard, icon: LayoutDashboard },
      { href: ROUTES.assistant.students, label: LABELS.nav.students, icon: Users },
      { href: ROUTES.assistant.newStudent, label: LABELS.nav.newStudent, shortLabel: LABELS.nav.short.newStudent, icon: UserPlus },
      { href: ROUTES.assistant.absences, label: LABELS.nav.absences, icon: CalendarX },
      { href: ROUTES.assistant.newTeacher, label: LABELS.nav.newTeacher, shortLabel: LABELS.nav.short.newTeacher, icon: GraduationCap },
    ],
    teacher: [
      { href: ROUTES.teacher.home, label: LABELS.nav.home, icon: House },
      { href: ROUTES.teacher.schedule, label: LABELS.nav.schedule, icon: CalendarDays },
    ],
    admin: [
      { href: ROUTES.admin.home, label: LABELS.nav.dashboard, shortLabel: LABELS.nav.short.dashboard, icon: LayoutDashboard },
      { href: ROUTES.admin.students, label: LABELS.nav.students, icon: Users },
      { href: ROUTES.admin.absences, label: LABELS.nav.absences, icon: CalendarX },
      { href: ROUTES.admin.subjects, label: LABELS.nav.subjects, shortLabel: LABELS.nav.short.subjects, icon: BookOpen },
      { href: ROUTES.admin.schedule, label: LABELS.nav.planning, icon: CalendarRange },
      { href: ROUTES.admin.users, label: LABELS.nav.users, icon: UserCog },
      { href: ROUTES.admin.reports, label: LABELS.nav.reports, icon: BarChart3 },
      { href: ROUTES.admin.payroll, label: LABELS.nav.payroll, icon: HandCoins },
      { href: ROUTES.admin.expenses, label: LABELS.nav.expenses, icon: ReceiptText },
      ...(options.brandingEditable ? [{ href: ROUTES.admin.branding, label: LABELS.nav.branding, icon: Palette }] : []),
      { href: ROUTES.admin.settings, label: LABELS.nav.settings, icon: Settings },
    ],
    platform: [
      { href: ROUTES.platform.home, label: LABELS.nav.dashboard, shortLabel: LABELS.nav.short.dashboard, icon: LayoutDashboard },
      { href: ROUTES.platform.centers, label: LABELS.nav.platformCenters, icon: Building2 },
      { href: ROUTES.platform.billing, label: LABELS.nav.platformBilling, icon: Wallet },
      { href: ROUTES.platform.settings, label: LABELS.nav.platformSettings, icon: Settings },
    ],
    styleguide: [
      { href: "/charte", label: LABELS.nav.styleguideTokens, icon: Palette },
      { href: "/charte/composants", label: LABELS.nav.styleguideComponents, icon: Component },
      { href: "/charte/etats", label: LABELS.nav.styleguideStates, icon: LayoutPanelTop },
    ],
  };
}
