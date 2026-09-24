import { LABELS } from "@/lib/constants/labels";
import { cn } from "@/lib/utils";

export type Status = keyof typeof LABELS.status;

type Tone = "success" | "danger" | "warning" | "neutral";

const STATUS_TONE: Record<Status, Tone> = {
  upToDate: "success",
  paid: "success",
  present: "success",
  overdue: "danger",
  absent: "danger",
  absence: "warning",
  followUp: "warning",
  pending: "neutral",
};

const TONE_STYLES: Record<Tone, { pill: string; dot: string }> = {
  success: { pill: "bg-success/10 text-success-ink", dot: "bg-success" },
  danger: { pill: "bg-danger/10 text-danger-ink", dot: "bg-danger" },
  warning: { pill: "bg-warning/10 text-warning-ink", dot: "bg-warning" },
  neutral: { pill: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
};

type StatusBadgeProps = {
  status: Status;
  className?: string;
};

/** Pastille en pilule : fond teinté à 10 %, texte coloré, toujours avec un libellé. */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const tone = TONE_STYLES[STATUS_TONE[status]];

  return (
    <span
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 text-caption font-medium whitespace-nowrap",
        tone.pill,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", tone.dot)} aria-hidden />
      {LABELS.status[status]}
    </span>
  );
}
