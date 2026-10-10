import type { CenterStatus } from "@/lib/data/platform";
import { getLabels } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

const TONE: Record<CenterStatus, string> = {
  trial: "text-primary",
  active: "text-success-ink",
  past_due: "text-warning-ink",
  suspended: "text-danger-ink",
  cancelled: "text-muted-foreground",
};

/** Statut d'un centre : point suivi du libellé coloré (jamais la couleur seule). */
export async function CenterStatusBadge({ status, className }: { status: CenterStatus; className?: string }) {
  const LABELS = await getLabels();
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 text-caption font-medium whitespace-nowrap",
        TONE[status],
        className,
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      {LABELS.platform.centerStatus[status]}
    </span>
  );
}
