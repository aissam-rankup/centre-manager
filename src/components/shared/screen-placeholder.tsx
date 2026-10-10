"use client";

import { Construction } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { useLabels } from "@/lib/i18n/client";

/** Écran provisoire, remplacé lors des phases 4 à 6. */
export function ScreenPlaceholder({ title }: { title: string }) {
  const LABELS = useLabels();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={title} />
      <EmptyState icon={Construction} title={LABELS.placeholder.title} description={LABELS.placeholder.description} />
    </div>
  );
}
