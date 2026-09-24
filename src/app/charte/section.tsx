import type { ReactNode } from "react";

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-section">{title}</h2>
        {hint ? <p className="text-caption text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}
