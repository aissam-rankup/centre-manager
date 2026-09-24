"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LABELS } from "@/lib/constants/labels";

const THEME_OPTIONS = [
  { value: "light", label: LABELS.theme.light, icon: Sun },
  { value: "dark", label: LABELS.theme.dark, icon: Moon },
  { value: "system", label: LABELS.theme.system, icon: Monitor },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={LABELS.theme.toggle}>
          <Sun className="size-5 dark:hidden" aria-hidden />
          <Moon className="hidden size-5 dark:block" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem key={value} onSelect={() => setTheme(value)} className="min-h-11 gap-3">
            <Icon className="size-4" aria-hidden />
            <span className="flex-1">{label}</span>
            {theme === value ? <Check className="size-4 text-primary" aria-hidden /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
