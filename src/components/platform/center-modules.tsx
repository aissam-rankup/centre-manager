"use client";

import { FlaskConical } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { ChoiceItem } from "@/components/shared/choice-item";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { setCenterModule } from "@/lib/actions/platform";
import type { CenterModule } from "@/lib/data/platform";
import { formatDate } from "@/lib/format";
import { useLabels, useMessage } from "@/lib/i18n/client";
import { MODULE_KEYS, type ModuleKey } from "@/lib/modules";

const isModuleKey = (value: string): value is ModuleKey => (MODULE_KEYS as readonly string[]).includes(value);

/**
 * Modules d'un centre : chaque interrupteur écrit center_modules (journalisé).
 * Un module coupé est masqué et bloqué côté serveur ; ses données restent.
 */
export function CenterModules({ centerId, modules }: { centerId: string; modules: readonly CenterModule[] }) {
  const M = useLabels().platform.modules;
  const message = useMessage();
  const [pending, startTransition] = useTransition();

  const toggle = (moduleKey: string, enabled: boolean, trial = false) => {
    if (!isModuleKey(moduleKey)) return;
    startTransition(async () => {
      const result = await setCenterModule({ centerId, moduleKey, enabled, trial });
      if (result.ok) toast.success(M.saved);
      else toast.error(message(result.error));
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-muted-foreground">{M.disableHint}</p>
      <ul className="flex flex-col gap-2">
        {modules.map((module) => (
          <li key={module.module_key} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <ChoiceItem className="flex-1 items-start">
              <Checkbox
                className="mt-1"
                checked={module.is_enabled}
                disabled={pending}
                aria-label={M.switchLabel(module.name)}
                onCheckedChange={(checked) => toggle(module.module_key, checked === true)}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-heading">{module.name}</span>
                  <Badge variant={module.is_enabled ? "default" : "outline"}>{module.is_enabled ? M.enabled : M.disabled}</Badge>
                  <Badge variant="secondary">{module.in_plan ? M.inPlan : M.notInPlan}</Badge>
                  {module.source !== "plan" ? <Badge variant="outline">{M.source[module.source]}</Badge> : null}
                </span>
                <span className="text-caption text-muted-foreground">{module.description}</span>
                {module.is_enabled && module.enabled_at ? (
                  <span className="text-caption text-muted-foreground">
                    {M.enabledSince(formatDate(module.enabled_at))}
                    {module.enabled_by_name ? ` · ${module.enabled_by_name}` : ""}
                  </span>
                ) : null}
              </span>
            </ChoiceItem>
            {!module.in_plan && !module.is_enabled ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                title={M.trialHint}
                onClick={() => toggle(module.module_key, true, true)}
              >
                <FlaskConical aria-hidden />
                {M.trial}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
