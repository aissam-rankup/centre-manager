import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Ligne de choix cliquable (44 px minimum) autour d'une case à cocher ou d'un bouton radio.
 * La ligne entière est la zone tactile ; l'état coché colore la bordure.
 */
export function ChoiceItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] border bg-card px-3 py-2 transition-colors hover:bg-muted/60",
        "has-[[data-state=checked]]:border-brand has-[[data-state=checked]]:bg-brand/5",
        "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
        className,
      )}
    >
      {children}
    </label>
  );
}
