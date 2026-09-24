import { cloneElement, type ReactElement } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FieldControlProps = {
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

type FormFieldProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  /** Champ unique (Input, Textarea…) : reçoit id et attributs ARIA. */
  children: ReactElement<FieldControlProps>;
  className?: string;
};

/** Libellé + champ + aide + message d'erreur, reliés pour les lecteurs d'écran. */
export function FormField({ id, label, hint, error, children, className }: FormFieldProps) {
  const hintId = hint ? `${id}-aide` : undefined;
  const errorId = error ? `${id}-erreur` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {cloneElement(children, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })}
      {hint ? (
        <p id={hintId} className="text-caption text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-caption text-danger-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
