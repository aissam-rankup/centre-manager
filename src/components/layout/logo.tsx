import { GraduationCap } from "lucide-react";

import { LABELS } from "@/lib/constants/labels";
import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  showName?: boolean;
};

export function Logo({ className, showName = true }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <GraduationCap className="size-5" aria-hidden />
      </span>
      {showName ? (
        <span className="text-base font-semibold tracking-tight">{LABELS.app.name}</span>
      ) : (
        <span className="sr-only">{LABELS.app.name}</span>
      )}
    </span>
  );
}
