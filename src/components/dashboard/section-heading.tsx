"use client";

import Link from "@/components/shared/app-link";
import type { ReactNode } from "react";

import { useLabels } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type SectionHeadingProps = {
  id?: string;
  title: string;
  /** Lien « Voir tout », aligné à droite. */
  href?: string;
  /** Actions à droite (ex. icônes), à la place ou en plus du lien. */
  actions?: ReactNode;
  className?: string;
};

/** Titre de section du tableau de bord : 16 px graisse 600, lien « Voir tout » à droite. */
export function SectionHeading({ id, title, href, actions, className }: SectionHeadingProps) {
  const LABELS = useLabels();
  return (
    <div className={cn("flex min-h-8 items-center justify-between gap-3", className)}>
      <h2 id={id} className="text-section">
        {title}
      </h2>
      <div className="flex items-center gap-4">
        {actions}
        {href ? (
          <Link href={href} className="rounded-sm text-caption text-muted-foreground transition-colors hover:text-primary">
            {LABELS.common.seeAll}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
