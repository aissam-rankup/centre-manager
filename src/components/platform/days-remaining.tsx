import { LABELS } from "@/lib/constants/labels";
import { cn } from "@/lib/utils";

/** Jours restants avant l'échéance, ou jours de retard (en rouge). */
export function DaysRemaining({ days, className }: { days: number | null; className?: string }) {
  if (days === null) return <span className={cn("text-muted-foreground", className)}>{LABELS.platform.noDueDate}</span>;
  return (
    <span
      className={cn(
        "numeric whitespace-nowrap",
        days < 0 ? "font-medium text-danger-ink" : days <= 7 ? "text-warning-ink" : "text-foreground",
        className,
      )}
    >
      {LABELS.platform.daysRemaining(days)}
    </span>
  );
}
