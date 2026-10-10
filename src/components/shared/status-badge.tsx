"use client";

import type { AppLabels } from "@/lib/constants/labels";
import { useLabels } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export type Status = keyof AppLabels["status"];

type Tone = "success" | "danger" | "warning" | "neutral";

const STATUS_TONE: Record<Status, Tone> = {
  upToDate: "success",
  paid: "success",
  present: "success",
  overdue: "danger",
  absent: "danger",
  absence: "warning",
  followUp: "warning",
  followedUp: "warning",
  pending: "neutral",
};

const TONE_STYLES: Record<Tone, { text: string; dot: string }> = {
  success: { text: "text-success-ink", dot: "bg-success" },
  danger: { text: "text-danger-ink", dot: "bg-danger" },
  warning: { text: "text-warning-ink", dot: "bg-warning" },
  neutral: { text: "text-muted-foreground", dot: "bg-muted-foreground" },
};

type StatusBadgeProps = {
  status: Status;
  className?: string;
};

/** Statut : point de 6 px suivi du libellé coloré, sans fond (jamais la couleur seule). */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const LABELS = useLabels();
  const tone = TONE_STYLES[STATUS_TONE[status]];

  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 text-caption font-medium whitespace-nowrap",
        tone.text,
        className,
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      {LABELS.status[status]}
    </span>
  );
}
