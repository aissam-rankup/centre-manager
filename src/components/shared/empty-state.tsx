import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: "neutral" | "danger";
  className?: string;
};

/** État vide illustré : pictogramme Lucide sur une composition sobre, sans dégradé. */
export function EmptyState({ icon: Icon, title, description, action, tone = "neutral", className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-card px-6 py-12 text-center",
        className,
      )}
    >
      <Illustration icon={Icon} tone={tone} />
      <div className="flex max-w-sm flex-col gap-2">
        <h2 className="text-section">{title}</h2>
        {description ? <p className="text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="mt-2 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </div>
  );
}

function Illustration({ icon: Icon, tone }: { icon: LucideIcon; tone: "neutral" | "danger" }) {
  return (
    <div className="relative size-32" aria-hidden>
      <svg viewBox="0 0 128 128" className="absolute inset-0 size-full" fill="none">
        <circle cx="64" cy="64" r="60" className="fill-muted" />
        <circle cx="64" cy="64" r="44" className="fill-card stroke-border" strokeWidth="1.5" strokeDasharray="4 5" />
        <circle cx="106" cy="30" r="6" className={tone === "danger" ? "fill-danger" : "fill-brand"} />
        <circle cx="20" cy="92" r="4" className="fill-primary/30" />
        <rect x="96" y="92" width="10" height="10" rx="3" className="fill-primary/15" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        <span
          className={cn(
            "flex size-14 items-center justify-center rounded-2xl shadow-soft",
            tone === "danger" ? "bg-danger/10 text-danger-ink" : "bg-primary text-primary-foreground",
          )}
        >
          <Icon className="size-7" />
        </span>
      </span>
    </div>
  );
}
