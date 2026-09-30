import { GraduationCap } from "lucide-react";

import { LABELS } from "@/lib/constants/labels";
import { cn } from "@/lib/utils";

type LogoProps = {
  /** « sidebar » : pour la barre latérale bleu nuit. */
  variant?: "default" | "sidebar";
  /** Marque blanche : nom et logo du centre. */
  name?: string;
  logoUrl?: string | null;
  className?: string;
};

export function Logo({ variant = "default", name = LABELS.app.name, logoUrl = null, className }: LogoProps) {
  if (logoUrl) {
    return (
      <span className={cn("inline-flex items-center gap-3", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- logo du client (bucket public) */}
        <img src={logoUrl} alt="" className="h-9 w-auto max-w-[140px] object-contain" />
        <span className="text-base font-semibold tracking-tight">{name}</span>
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-lg",
          variant === "sidebar" ? "bg-white/10 text-white" : "bg-primary text-primary-foreground",
        )}
      >
        <GraduationCap className="size-5" aria-hidden />
      </span>
      <span className="text-base font-semibold tracking-tight">{name}</span>
    </span>
  );
}
