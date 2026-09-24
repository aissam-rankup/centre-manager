import { AlertTriangle, CalendarX, Check, Plus, UserPlus, Users, Wallet, X } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard, StatCardSkeleton } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LABELS } from "@/lib/constants/labels";
import { formatDateLong, formatDateShort, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

import { ToastDemo } from "./toast-demo";

const L = LABELS.styleguide;

export const metadata: Metadata = { title: L.title };

const SWATCHES = [
  { label: L.swatches.primary, className: "bg-primary", token: "--primary" },
  { label: L.swatches.highlight, className: "bg-highlight", token: "--highlight" },
  { label: L.swatches.success, className: "bg-success", token: "--success" },
  { label: L.swatches.overdue, className: "bg-overdue", token: "--overdue" },
  { label: L.swatches.absence, className: "bg-absence", token: "--absence" },
  { label: L.swatches.muted, className: "bg-muted-foreground", token: "--muted-foreground" },
] as const;

// Date de démonstration fixe pour un rendu stable.
const DEMO_DATE = new Date(2026, 8, 24);

export default function StyleguidePage() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader title={L.title} description={L.description} />

      <Section title={L.sections.colors}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {SWATCHES.map((swatch) => (
            <Card key={swatch.token} size="sm" className="gap-3 pt-0">
              <div className={cn("h-16", swatch.className)} />
              <CardContent className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{swatch.label}</span>
                <code className="text-xs text-muted-foreground">{swatch.token}</code>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section title={L.sections.typography}>
        <Card>
          <CardContent className="flex flex-col gap-4">
            <p className="text-3xl font-semibold tracking-tight">{L.typography.display}</p>
            <p className="text-xl font-semibold">{L.typography.heading}</p>
            <p className="text-base">{L.typography.body}</p>
            <p className="text-sm text-muted-foreground">{L.typography.caption}</p>
            <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">{L.typography.amountLabel}</span>
                <Money amount={12450} className="text-2xl font-semibold" />
                <Money amount={850} className="text-2xl font-semibold" />
                <Money amount={1200} variant="long" className="text-sm text-muted-foreground" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">{L.typography.dateLabel}</span>
                <span className="numeric text-lg font-medium">{formatDateShort(DEMO_DATE)}</span>
                <span className="text-lg font-medium">{formatDateLong(DEMO_DATE)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section title={L.sections.buttons}>
        <Card>
          <CardContent className="flex flex-col gap-6">
            <div className="flex flex-wrap gap-3">
              <Button>
                <Plus data-icon="inline-start" aria-hidden />
                {L.buttons.primary}
              </Button>
              <Button variant="highlight">{L.buttons.highlight}</Button>
              <Button variant="secondary">{L.buttons.secondary}</Button>
              <Button variant="outline">{L.buttons.outline}</Button>
              <Button variant="ghost">{L.buttons.ghost}</Button>
              <Button variant="destructive">{L.buttons.destructive}</Button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:max-w-md">
              <Button variant="success" size="call">
                <Check aria-hidden />
                {L.buttons.present}
              </Button>
              <Button variant="overdue" size="call">
                <X aria-hidden />
                {L.buttons.absent}
              </Button>
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section title={L.sections.badges}>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status="upToDate" />
          <StatusBadge status="overdue" />
          <StatusBadge status="pending" />
          <StatusBadge status="absent" />
          <StatusBadge status="present" />
        </div>
      </Section>

      <Section title={L.sections.stats}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label={L.stats.collected}
            value={<Money amount={48600} />}
            icon={Wallet}
            tone="success"
            hint={`+${formatPercent(0.082)} ${L.stats.vsLastMonth}`}
          />
          <StatCard label={L.stats.expected} value={<Money amount={56200} />} icon={Wallet} tone="primary" />
          <StatCard label={L.stats.unpaid} value="14" icon={AlertTriangle} tone="overdue" />
          <StatCard label={L.stats.absencesToday} value="6" icon={CalendarX} tone="absence" />
        </div>
      </Section>

      <Section title={L.sections.emptyState}>
        <EmptyState
          icon={Users}
          title={L.emptyState.title}
          description={L.emptyState.description}
          action={
            <Button>
              <UserPlus data-icon="inline-start" aria-hidden />
              {L.emptyState.action}
            </Button>
          }
        />
      </Section>

      <Section title={L.sections.loading}>
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCardSkeleton />
            <StatCardSkeleton />
          </div>
          <Card aria-hidden>
            <CardContent className="flex flex-col gap-4">
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-center gap-3">
                  <Skeleton className="size-11 rounded-full" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-2/5" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title={L.sections.toasts}>
        <ToastDemo />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
