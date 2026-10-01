"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LABELS } from "@/lib/constants/labels";

const L = LABELS.platform.accessLink;

/** Lien d'invitation ou de mot de passe à transmettre quand le courriel n'a pas pu partir. */
export function AccessLinkDialog({
  link,
  email,
  onClose,
}: {
  link: string | null;
  email: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(link)} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-section">{L.title}</DialogTitle>
          <DialogDescription>{L.description(email)}</DialogDescription>
        </DialogHeader>
        <Input readOnly value={link ?? ""} onFocus={(event) => event.target.select()} className="font-normal" aria-label={L.title} />
        <p className="text-caption text-muted-foreground">{L.personal}</p>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              if (!link) return;
              await navigator.clipboard.writeText(link);
              toast.success(L.copied);
            }}
          >
            <Copy aria-hidden />
            {L.copy}
          </Button>
          <Button type="button" onClick={onClose}>
            {L.continue}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
