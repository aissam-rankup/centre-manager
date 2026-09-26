"use client";

import { LoaderCircle, Save, Trash2 } from "lucide-react";
import { type ReactElement, useState, useTransition } from "react";
import { toast } from "sonner";

import { type CapturedPhoto, PhotoCapture } from "@/components/assistant/photo-capture";
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
import type { ActionResult } from "@/lib/actions/result";
import { LABELS } from "@/lib/constants/labels";

const P = LABELS.auth.photo;

type StaffPhotoDialogProps = {
  /** Déclencheur ; sans lui, le dialogue est piloté par open / onOpenChange. */
  trigger?: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description: string;
  name: string;
  currentUrl: string | null;
  onSave: (formData: FormData) => Promise<ActionResult>;
  onRemove: () => Promise<ActionResult>;
};

/** Prise ou choix d'une photo de membre de l'équipe, puis enregistrement ou retrait. */
export function StaffPhotoDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
  title,
  description,
  name,
  currentUrl,
  onSave,
  onRemove,
}: StaffPhotoDialogProps) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [pending, startTransition] = useTransition();

  const setOpen = (value: boolean) => {
    if (!value && photo) {
      URL.revokeObjectURL(photo.previewUrl);
      setPhoto(null);
    }
    setInnerOpen(value);
    onOpenChange?.(value);
  };

  const run = (action: () => Promise<ActionResult>, message: string) => {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(message);
      setOpen(false);
    });
  };

  const save = () => {
    if (!photo) return;
    const data = new FormData();
    data.set("photo", new File([photo.blob], "photo.jpg", { type: "image/jpeg" }));
    run(() => onSave(data), P.saved);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-section">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <PhotoCapture
          name={name}
          value={photo}
          onChange={setPhoto}
          currentUrl={currentUrl}
          label={P.label}
          hint={P.hint}
          capture="user"
        />
        <DialogFooter className="gap-2">
          {currentUrl && !photo ? (
            <Button type="button" variant="outline" disabled={pending} onClick={() => run(onRemove, P.removed)}>
              {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
              {P.remove}
            </Button>
          ) : null}
          <Button type="button" disabled={!photo || pending} onClick={save}>
            {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            {P.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
