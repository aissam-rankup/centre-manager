"use client";

import { LoaderCircle } from "lucide-react";
import type { FormEventHandler, ReactElement, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LABELS } from "@/lib/constants/labels";

type FormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactElement;
  title: string;
  description?: string;
  pending: boolean;
  error: string | null;
  submitLabel?: string;
  /** Bloque l'enregistrement (ex. conflit de planning affiché dans le formulaire). */
  submitDisabled?: boolean;
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
};

/** Dialogue de formulaire : titre, champs, erreur serveur, Annuler / Enregistrer. */
export function FormDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  pending,
  error,
  submitLabel = LABELS.admin.common.save,
  submitDisabled = false,
  onSubmit,
  children,
}: FormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle className="text-section">{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          {children}
          {error ? (
            <p role="alert" className="rounded-[10px] bg-danger/10 px-4 py-3 text-danger-ink">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              {LABELS.common.cancel}
            </Button>
            <Button type="submit" disabled={pending || submitDisabled}>
              {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
              {pending ? LABELS.admin.common.saving : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
