"use client";

import { Tag } from "lucide-react";

import { type DiscountSummary, discountBadgeLabel, discountScopeLabel } from "@/lib/discounts";
import { useLabels } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/** Badge de remise : pastille orangée, icône étiquette, valeur et motif (« Remise 25 % — fratrie »). */
export function DiscountBadge({ discount, className }: { discount: DiscountSummary; className?: string }) {
  const LABELS = useLabels();
  const label = discountBadgeLabel(discount, LABELS);
  const scope = discountScopeLabel(discount, LABELS);

  return (
    <span
      title={LABELS.discounts.appliesTo(scope)}
      className={cn(
        "inline-flex w-fit max-w-full items-center gap-1.5 rounded-full border border-highlight/50 bg-highlight/15 px-2.5 py-0.5 text-caption font-medium text-foreground",
        className,
      )}
    >
      <Tag className="size-3.5 shrink-0 text-highlight" aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** Remises d'un élève dans une liste : les premières, puis « +n ». */
export function DiscountBadges({
  discounts,
  max = 1,
  className,
}: {
  discounts: DiscountSummary[];
  max?: number;
  className?: string;
}) {
  const LABELS = useLabels();
  if (discounts.length === 0) return null;
  const rest = discounts.length - max;

  return (
    <span className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}>
      {discounts.slice(0, max).map((discount, index) => (
        <DiscountBadge key={index} discount={discount} />
      ))}
      {rest > 0 ? (
        <span
          className="text-caption font-medium text-muted-foreground"
          title={discounts
            .slice(max)
            .map((discount) => discountBadgeLabel(discount, LABELS))
            .join(" · ")}
        >
          {LABELS.discounts.more(rest)}
        </span>
      ) : null}
    </span>
  );
}
