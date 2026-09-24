import { Construction } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { LABELS } from "@/lib/constants/labels";

/** Écran provisoire, remplacé lors des phases 4 à 6. */
export function ScreenPlaceholder({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={title} />
      <EmptyState icon={Construction} title={LABELS.placeholder.title} description={LABELS.placeholder.description} />
    </div>
  );
}
