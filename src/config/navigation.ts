import {
  BarChart3,
  BookOpen,
  CalendarDays,
  CalendarRange,
  Component,
  GraduationCap,
  House,
  LayoutDashboard,
  LayoutPanelTop,
  Palette,
  UserPlus,
  Users,
  UserCog,
} from "lucide-react";

import type { NavItem } from "@/components/layout/nav-types";
import { ROUTES } from "@/lib/auth/routes";
import { LABELS } from "@/lib/constants/labels";

export type NavSpace = "assistant" | "teacher" | "admin" | "styleguide";

export const NAVIGATION: Record<NavSpace, readonly NavItem[]> = {
  assistant: [
    { href: ROUTES.assistant.home, label: LABELS.nav.dashboard, shortLabel: LABELS.nav.short.dashboard, icon: LayoutDashboard },
    { href: ROUTES.assistant.students, label: LABELS.nav.students, icon: Users },
    { href: ROUTES.assistant.newStudent, label: LABELS.nav.newStudent, shortLabel: LABELS.nav.short.newStudent, icon: UserPlus },
    { href: ROUTES.assistant.newTeacher, label: LABELS.nav.newTeacher, shortLabel: LABELS.nav.short.newTeacher, icon: GraduationCap },
  ],
  teacher: [
    { href: ROUTES.teacher.home, label: LABELS.nav.home, icon: House },
    { href: ROUTES.teacher.schedule, label: LABELS.nav.schedule, icon: CalendarDays },
  ],
  admin: [
    { href: ROUTES.admin.home, label: LABELS.nav.dashboard, shortLabel: LABELS.nav.short.dashboard, icon: LayoutDashboard },
    { href: ROUTES.admin.students, label: LABELS.nav.students, icon: Users },
    { href: ROUTES.admin.subjects, label: LABELS.nav.subjects, shortLabel: LABELS.nav.short.subjects, icon: BookOpen },
    { href: ROUTES.admin.schedule, label: LABELS.nav.planning, icon: CalendarRange },
    { href: ROUTES.admin.users, label: LABELS.nav.users, icon: UserCog },
    { href: ROUTES.admin.reports, label: LABELS.nav.reports, icon: BarChart3 },
  ],
  styleguide: [
    { href: "/charte", label: LABELS.nav.styleguideTokens, icon: Palette },
    { href: "/charte/composants", label: LABELS.nav.styleguideComponents, icon: Component },
    { href: "/charte/etats", label: LABELS.nav.styleguideStates, icon: LayoutPanelTop },
  ],
};
