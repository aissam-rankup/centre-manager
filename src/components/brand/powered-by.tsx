import { Logo } from "@/components/brand/logo";
import { LABELS } from "@/lib/constants/labels";
import { cn } from "@/lib/utils";

/** Mention discrète « Propulsé par dirassty » (centres hors marque blanche). */
export function PoweredBy({ className }: { className?: string }) {
  return (
    <p className={cn("inline-flex items-center gap-1.5 text-caption text-muted-foreground", className)}>
      <Logo variant="mark" height={16} />
      <span>{LABELS.app.poweredBy}</span>
    </p>
  );
}
