import type { Metadata } from "next";

import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { Badge } from "@/components/ui/badge";
import { LABELS } from "@/lib/constants/labels";
import { getPlatformCatalogue } from "@/lib/data/platform";

import { PlanDialog } from "./plan-dialog";

const C = LABELS.platform.catalogue;

export const metadata: Metadata = { title: C.title };

/** Catalogue : packs commerciaux, modules activables, socle, et règle des demandes futures. */
export default async function CataloguePage() {
  const { plans, modules } = await getPlatformCatalogue();
  const moduleNames = new Map(modules.map((module) => [module.key, module.name]));
  const planNames = new Map(plans.map((plan) => [plan.key, plan.name]));
  const categories: Record<string, string> = C.categories;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={C.title} description={C.description} />

      <section aria-labelledby="packs" className="flex flex-col gap-3">
        <h2 id="packs" className="text-heading font-semibold">
          {C.plans}
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {plans.map((plan) => (
            <SectionCard
              key={plan.key}
              title={plan.name}
              description={plan.description || undefined}
              aside={
                <PlanDialog
                  defaults={{
                    key: plan.key,
                    name: plan.name,
                    description: plan.description,
                    monthlyPrice: String(plan.monthly_price),
                  }}
                />
              }
            >
              <dl className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <dt className="text-caption text-muted-foreground">{C.monthlyPrice}</dt>
                  <dd className="font-medium text-heading">
                    <Money amount={Number(plan.monthly_price)} />
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-caption text-muted-foreground">{LABELS.platform.centers.title}</dt>
                  <dd className="font-medium text-heading">{C.centersCount(plan.centers_count)}</dd>
                </div>
              </dl>
              <div className="flex flex-col gap-2">
                <p className="text-caption text-muted-foreground">{C.includes}</p>
                <ul className="flex flex-wrap gap-2">
                  {plan.modules.map((key) => (
                    <li key={key}>
                      <Badge variant="secondary">{moduleNames.get(key) ?? key}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            </SectionCard>
          ))}
        </div>
      </section>

      <SectionCard title={C.modules}>
        <ul className="flex flex-col divide-y divide-divider">
          {modules.map((module) => (
            <li key={module.key} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-heading">{module.name}</span>
                  <Badge variant="outline">{categories[module.category] ?? module.category}</Badge>
                </span>
                <span className="text-caption text-muted-foreground">{module.description}</span>
              </div>
              <div className="flex shrink-0 flex-col gap-1 text-caption sm:items-end">
                <span>
                  {C.inPlans} :{" "}
                  {module.plans.length > 0 ? module.plans.map((key) => planNames.get(key) ?? key).join(", ") : C.noPlan}
                </span>
                <span className="text-muted-foreground">{C.centersCount(module.centers_count)}</span>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title={C.core.title}>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {C.core.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </SectionCard>
        <SectionCard title={C.rule.title}>
          <ol className="flex list-decimal flex-col gap-2 pl-5">
            {C.rule.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </SectionCard>
      </div>
    </div>
  );
}
