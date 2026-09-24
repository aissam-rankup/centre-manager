import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SectionCardProps = {
  title: string;
  description?: string;
  /** Élément à droite du titre (compteur, action). */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
};

/** Section d'écran : carte avec titre de section (20 px, 600). */
export function SectionCard({ title, description, aside, children, className, id }: SectionCardProps) {
  const headingId = id ? `${id}-titre` : undefined;
  return (
    <section aria-labelledby={headingId} className={cn("min-w-0", className)} id={id}>
      <Card className="h-full">
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 id={headingId} className="text-section">
                {title}
              </h2>
              {description ? <p className="text-caption text-muted-foreground">{description}</p> : null}
            </div>
            {aside ? <div className="shrink-0">{aside}</div> : null}
          </div>
          {children}
        </CardContent>
      </Card>
    </section>
  );
}
