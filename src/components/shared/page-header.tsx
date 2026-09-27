import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  /**
   * Le titre de section est affiché en grand par l'en-tête de l'application.
   * Par défaut, le titre de la page n'est lu que par les lecteurs d'écran ;
   * « showTitle » l'affiche quand il apporte une information (ex. « Bonjour Rachid »).
   */
  showTitle?: boolean;
  className?: string;
};

export function PageHeader({ title, description, actions, showTitle = false, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="flex flex-col gap-1">
        <h1 className={showTitle ? "text-section" : "sr-only"}>{title}</h1>
        {description ? <p className="text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
