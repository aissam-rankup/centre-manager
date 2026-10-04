import {
  Banknote,
  BarChart3,
  BookOpen,
  Building2,
  CalendarX,
  CalendarDays,
  CalendarRange,
  CalendarSync,
  ClipboardCheck,
  Component,
  FolderOpen,
  DoorOpen,
  GraduationCap,
  HandCoins,
  House,
  LayoutDashboard,
  LayoutPanelTop,
  Layers,
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
import type { ModuleKey } from "@/lib/modules";

export type NavSpace = "assistant" | "teacher" | "admin" | "platform" | "styleguide";

/** Entrée réservée à un module : absente si le centre ne l'a pas. */
type GatedNavItem = NavItem & { module?: ModuleKey };

/**
 * Entrées de navigation, dans le vocabulaire du centre, limitées aux modules
 * actifs (`modules`). Confort visuel : les routes d'un module absent renvoient
 * de toute façon une 404.
 */
export function navigationFor(
  LABELS: AppLabels,
  options: { brandingEditable?: boolean; reenrollment?: boolean; modules?: readonly ModuleKey[] } = {},
): Record<NavSpace, readonly NavItem[]> {
  const modules = options.modules ?? [];
  const visible = (items: readonly GatedNavItem[]): NavItem[] =>
    items.filter((item) => !item.module || modules.includes(item.module));
  const spaces: Record<NavSpace, readonly GatedNavItem[]> = {
    assistant: [
      { href: ROUTES.assistant.home, label: LABELS.nav.dashboard, shortLabel: LABELS.nav.short.dashboard, icon: LayoutDashboard },
      { href: ROUTES.assistant.students, label: LABELS.nav.students, icon: Users },
      { href: ROUTES.assistant.newStudent, label: LABELS.nav.newStudent, shortLabel: LABELS.nav.short.newStudent, icon: UserPlus },
      { href: ROUTES.assistant.cash, label: LABELS.nav.cash, icon: Banknote, module: "finance" },
      { href: ROUTES.assistant.sessions, label: LABELS.nav.sessions, shortLabel: LABELS.nav.short.sessions, icon: ClipboardCheck },
      { href: ROUTES.assistant.absences, label: LABELS.nav.absences, icon: CalendarX },
      ...(options.reenrollment
        ? [{ href: ROUTES.assistant.reenrollment, label: LABELS.nav.reenrollment, icon: CalendarSync, module: "reenrollment" as const }]
        : []),
      { href: ROUTES.assistant.newTeacher, label: LABELS.nav.newTeacher, shortLabel: LABELS.nav.short.newTeacher, icon: GraduationCap },
    ],
    teacher: [
      { href: ROUTES.teacher.home, label: LABELS.nav.home, icon: House },
      { href: ROUTES.teacher.schedule, label: LABELS.nav.schedule, icon: CalendarDays },
      { href: ROUTES.teacher.resources, label: LABELS.nav.resources, icon: FolderOpen, module: "lms" },
    ],
    admin: [
      { href: ROUTES.admin.home, label: LABELS.nav.dashboard, shortLabel: LABELS.nav.short.dashboard, icon: LayoutDashboard },
      { href: ROUTES.admin.students, label: LABELS.nav.students, icon: Users },
      { href: ROUTES.admin.absences, label: LABELS.nav.absences, icon: CalendarX },
      { href: ROUTES.admin.subjects, label: LABELS.nav.subjects, shortLabel: LABELS.nav.short.subjects, icon: BookOpen },
      ...(options.reenrollment
        ? [{ href: ROUTES.admin.reenrollment, label: LABELS.nav.reenrollment, icon: CalendarSync, module: "reenrollment" as const }]
        : []),
      { href: ROUTES.admin.schedule, label: LABELS.nav.planning, icon: CalendarRange },
      { href: ROUTES.admin.rooms, label: LABELS.nav.rooms, icon: DoorOpen },
      { href: ROUTES.admin.users, label: LABELS.nav.users, icon: UserCog },
      { href: ROUTES.admin.reports, label: LABELS.nav.reports, icon: BarChart3 },
      { href: ROUTES.admin.payroll, label: LABELS.nav.payroll, icon: HandCoins, module: "finance" },
      { href: ROUTES.admin.expenses, label: LABELS.nav.expenses, icon: ReceiptText, module: "finance" },
      { href: ROUTES.admin.cash, label: LABELS.nav.cash, icon: Banknote, module: "finance" },
      ...(options.brandingEditable
        ? [{ href: ROUTES.admin.branding, label: LABELS.nav.branding, icon: Palette, module: "white_label" as const }]
        : []),
      { href: ROUTES.admin.settings, label: LABELS.nav.settings, icon: Settings },
    ],
    platform: [
      { href: ROUTES.platform.home, label: LABELS.nav.dashboard, shortLabel: LABELS.nav.short.dashboard, icon: LayoutDashboard },
      { href: ROUTES.platform.centers, label: LABELS.nav.platformCenters, icon: Building2 },
      { href: ROUTES.platform.catalogue, label: LABELS.nav.platformCatalogue, icon: Layers },
      { href: ROUTES.platform.billing, label: LABELS.nav.platformBilling, icon: Wallet },
      { href: ROUTES.platform.settings, label: LABELS.nav.platformSettings, icon: Settings },
    ],
    styleguide: [
      { href: "/charte", label: LABELS.nav.styleguideTokens, icon: Palette },
      { href: "/charte/composants", label: LABELS.nav.styleguideComponents, icon: Component },
      { href: "/charte/etats", label: LABELS.nav.styleguideStates, icon: LayoutPanelTop },
    ],
  };
  return {
    assistant: visible(spaces.assistant),
    teacher: visible(spaces.teacher),
    admin: visible(spaces.admin),
    platform: spaces.platform,
    styleguide: spaces.styleguide,
  };
}
