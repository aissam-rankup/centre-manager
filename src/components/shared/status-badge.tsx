import { Badge } from "@/components/ui/badge";
import { LABELS } from "@/lib/constants/labels";
import { cn } from "@/lib/utils";

export type Status = "upToDate" | "paid" | "overdue" | "pending" | "absent" | "present";

const STATUS_STYLES: Record<Status, { variant: "success" | "overdue" | "absence" | "secondary"; dot: string }> = {
  upToDate: { variant: "success", dot: "bg-success" },
  paid: { variant: "success", dot: "bg-success" },
  present: { variant: "success", dot: "bg-success" },
  overdue: { variant: "overdue", dot: "bg-overdue" },
  absent: { variant: "absence", dot: "bg-absence" },
  pending: { variant: "secondary", dot: "bg-muted-foreground" },
};

type StatusBadgeProps = {
  status: Status;
  className?: string;
};

/** Pastille de statut : couleur + libellé, jamais la couleur seule. */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { variant, dot } = STATUS_STYLES[status];

  return (
    <Badge variant={variant} className={cn("gap-1.5 px-2.5", className)}>
      <span className={cn("size-2 rounded-full", dot)} aria-hidden />
      {LABELS.status[status]}
    </Badge>
  );
}
