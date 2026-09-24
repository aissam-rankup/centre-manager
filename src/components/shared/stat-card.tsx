import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Tone = "primary" | "brand" | "success" | "danger" | "warning";

const TONE_STYLES: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  brand: "bg-brand/10 text-brand-ink",
  success: "bg-success/10 text-success-ink",
  danger: "bg-danger/10 text-danger-ink",
  warning: "bg-warning/10 text-warning-ink",
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
      <CardContent className="flex flex-col items-start gap-3 sm:flex-row sm:gap-4">
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-[10px]", TONE_STYLES[tone])}>
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-caption text-muted-foreground">{label}</p>
          <p className="numeric text-2xl leading-8">{value}</p>
          {hint ? <p className="text-caption text-muted-foreground">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className} aria-hidden>
      <CardContent className="flex flex-col items-start gap-3 sm:flex-row sm:gap-4">
        <Skeleton className="size-11 rounded-[10px]" />
        <div className="flex w-full min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-24 max-w-full" />
          <Skeleton className="h-8 w-32 max-w-full" />
          <Skeleton className="h-3 w-40 max-w-full" />
        </div>
      </CardContent>
    </Card>
  );
}
