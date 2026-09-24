import { UserPlus, Users } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatCardSkeleton } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LABELS } from "@/lib/constants/labels";

import { Section } from "../section";
import { ErrorDemo, ToastDemo } from "./demos";

const L = LABELS.styleguide;

export const metadata: Metadata = { title: L.states.title };

export default function StatesPage() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader title={L.states.title} description={L.states.description} />

      <Section title={L.sections.emptyState}>
        <EmptyState
          icon={Users}
          title={L.emptyState.title}
          description={L.emptyState.description}
          action={
            <Button>
              <UserPlus aria-hidden />
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
                  <Skeleton className="size-10 rounded-full" />
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

      <Section title={L.sections.error}>
        <ErrorDemo />
      </Section>

      <Section title={L.sections.toasts}>
        <ToastDemo />
      </Section>
    </div>
  );
}
