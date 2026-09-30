"use client";

import { Tabs } from "radix-ui";
import type { ReactNode } from "react";

import { useLabels } from "@/lib/i18n/client";

type Panel = { value: string; label: string; count: number; content: ReactNode };

/** Onglets de la fiche élève : Paiements / Absences / Relances (clavier : flèches). */
export function StudentTabs({ panels, defaultValue }: { panels: Panel[]; defaultValue?: string }) {
  const LABELS = useLabels();
  return (
    <Tabs.Root defaultValue={panels.some((panel) => panel.value === defaultValue) ? defaultValue : panels[0]?.value} className="flex flex-col gap-4">
      <Tabs.List
        aria-label={LABELS.assistant.student.tabsLabel}
        className="no-scrollbar flex w-full gap-1 overflow-x-auto rounded-xl bg-card p-1 shadow-card sm:w-fit"
      >
        {panels.map((panel) => (
          <Tabs.Trigger
            key={panel.value}
            value={panel.value}
            className="inline-flex h-9 flex-1 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-table font-medium whitespace-nowrap text-muted-foreground transition-colors duration-200 hover:text-heading data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:flex-none"
          >
            {panel.label}
            <span className="numeric rounded-full bg-current/15 px-1.5 text-caption">{panel.count}</span>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {panels.map((panel) => (
        <Tabs.Content key={panel.value} value={panel.value} className="animate-enter outline-none">
          {panel.content}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
