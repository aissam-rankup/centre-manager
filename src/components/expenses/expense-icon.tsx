import {
  BookOpen,
  Car,
  Droplet,
  Ellipsis,
  House,
  Landmark,
  type LucideIcon,
  Megaphone,
  Package,
  Printer,
  Receipt,
  Shield,
  Sparkles,
  Users,
  Wifi,
  Wrench,
  Zap,
} from "lucide-react";

import type { ExpenseIcon as ExpenseIconName } from "@/lib/expenses";
import { cn } from "@/lib/utils";

const ICONS: Record<ExpenseIconName, LucideIcon> = {
  house: House,
  zap: Zap,
  droplet: Droplet,
  wifi: Wifi,
  sparkles: Sparkles,
  package: Package,
  wrench: Wrench,
  landmark: Landmark,
  megaphone: Megaphone,
  ellipsis: Ellipsis,
  receipt: Receipt,
  car: Car,
  "book-open": BookOpen,
  users: Users,
  shield: Shield,
  printer: Printer,
};

/** Pastille d'icône d'une catégorie de charges. */
export function ExpenseIcon({ name, className }: { name: ExpenseIconName; className?: string }) {
  const Icon = ICONS[name];
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary", className)}>
      <Icon className="size-4.5" aria-hidden />
    </span>
  );
}
