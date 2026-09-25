"use client";

import { LoaderCircle } from "lucide-react";
import { type ReactElement, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/actions/result";
import { LABELS } from "@/lib/constants/labels";

type ConfirmActionProps = {
  /** Bouton déclencheur. */
  trigger: ReactElement;
  title: string;
  description: string;
  confirmLabel: string;
  successMessage: string;
  variant?: "danger" | "default";
  action: () => Promise<ActionResult<unknown>>;
  onDone?: () => void;
};

/** Confirmation d'une action sensible (suppression, désactivation) puis exécution. */
export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel,
  successMessage,
  variant = "danger",
  action,
  onDone,
}: ConfirmActionProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(successMessage);
      setOpen(false);
      onDone?.();
    });
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setError(null);
      }}
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-section">{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="rounded-[10px] bg-danger/10 px-4 py-3 text-danger-ink">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{LABELS.common.cancel}</AlertDialogCancel>
          <Button variant={variant} onClick={run} disabled={pending}>
            {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
