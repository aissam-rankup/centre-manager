import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Tone = "primary" | "highlight" | "success" | "overdue" | "absence";

const TONE_STYLES: Record<Tone, string> = {
  primary: "bg-accent text-primary",
  highlight: "bg-highlight-soft text-highlight-foreground dark:text-highlight",
  success: "bg-success-soft text-success",
  overdue: "bg-overdue-soft text-overdue",
  absence: "bg-absence-soft text-absence",
};

type StatCardProps = {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  hint?: ReactNode;
  className?: string;
};

export function StatCard({ label, value, icon: Icon, tone = "primary", hint, className }: StatCardProps) {
  return (
    <Card className={className}>
      <CardContent className="flex items-start gap-4">
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", TONE_STYLES[tone])}>
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="numeric text-2xl font-semibold tracking-tight">{value}</p>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className} aria-hidden>
      <CardContent className="flex items-start gap-4">
        <Skeleton className="size-11 rounded-xl" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3 w-40" />
        </div>
      </CardContent>
    </Card>
  );
}
