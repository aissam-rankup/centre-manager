"use client";

import { useLabels } from "@/lib/i18n/client";
import { passwordStrength } from "@/lib/password";
import { cn } from "@/lib/utils";

const TONES = ["bg-muted", "bg-danger", "bg-warning", "bg-success", "bg-success"] as const;

/** Robustesse indicative du mot de passe saisi (4 segments et libellé). */
export function PasswordStrength({ password, id }: { password: string; id?: string }) {
  const S = useLabels().passwords.strength;
  const score = passwordStrength(password);
  if (!password) return null;
  return (
    <div id={id} className="flex items-center gap-3" aria-live="polite">
      <div className="flex flex-1 gap-1" aria-hidden>
        {[1, 2, 3, 4].map((step) => (
          <span key={step} className={cn("h-1.5 flex-1 rounded-full", step <= score ? TONES[score] : "bg-muted")} />
        ))}
      </div>
      <span className="text-caption text-muted-foreground">
        {S.label} : <span className="font-medium text-foreground">{S.levels[score]}</span>
      </span>
    </div>
  );
}
