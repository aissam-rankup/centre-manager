"use client";

import { ChoiceItem } from "@/components/shared/choice-item";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { LABELS } from "@/lib/constants/labels";
import type { PlanOption } from "@/lib/data/platform";
import { formatMAD } from "@/lib/format";

const N = LABELS.platform.newCenter;

/** Choix du pack d'un centre (catalogue : nom, contenu, prix indicatif). */
export function PlanChoice({
  plans,
  value,
  onChange,
}: {
  plans: readonly PlanOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <RadioGroup value={value} onValueChange={onChange}>
      {plans.map((plan) => (
        <ChoiceItem key={plan.key} className="items-start">
          <RadioGroupItem value={plan.key} className="mt-0.5" />
          <span className="flex flex-col">
            <span className="font-medium">{plan.name}</span>
            {plan.description ? <span className="text-caption text-muted-foreground">{plan.description}</span> : null}
            {plan.monthlyPrice > 0 ? (
              <span className="numeric text-caption text-muted-foreground">{N.planPrice(formatMAD(plan.monthlyPrice))}</span>
            ) : null}
          </span>
        </ChoiceItem>
      ))}
    </RadioGroup>
  );
}
