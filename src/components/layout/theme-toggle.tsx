"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { useLabels } from "@/lib/i18n/client";

const noop = () => () => {};

export function ThemeToggle() {
  const LABELS = useLabels();
  const { resolvedTheme, setTheme } = useTheme();
  // Le thème n'est connu qu'après hydratation : rendu serveur = thème clair par défaut.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? LABELS.theme.toggleToLight : LABELS.theme.toggleToDark}
    >
      <Moon className="dark:hidden" aria-hidden />
      <Sun className="hidden dark:block" aria-hidden />
    </Button>
  );
}
