import { GraduationCap } from "lucide-react";

import { LABELS } from "@/lib/constants/labels";
import { cn } from "@/lib/utils";

type LogoProps = {
  /** « sidebar » : pour la barre latérale bleu nuit. */
  variant?: "default" | "sidebar";
  className?: string;
};

export function Logo({ variant = "default", className }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-[10px]",
          variant === "sidebar" ? "bg-white/10 text-white" : "bg-primary text-primary-foreground",
        )}
      >
        <GraduationCap className="size-5" aria-hidden />
      </span>
      <span className="text-base font-semibold tracking-tight">{LABELS.app.name}</span>
    </span>
  );
}
