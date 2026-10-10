import { Logo } from "@/components/brand/logo";
import { getLabels } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

/** Mention discrète « Propulsé par dirassty » (centres hors marque blanche). */
export async function PoweredBy({ className }: { className?: string }) {
  const LABELS = await getLabels();
  return (
    <p className={cn("inline-flex items-center gap-1.5 text-caption text-muted-foreground", className)}>
      <Logo variant="mark" height={16} />
      <span>{LABELS.app.poweredBy}</span>
    </p>
  );
}
