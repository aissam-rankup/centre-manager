"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, MessageSquarePlus } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { ChoiceItem } from "@/components/shared/choice-item";
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { recordFollowUp } from "@/lib/actions/assistant";
import { LABELS } from "@/lib/constants/labels";
import { type FollowUpInput, followUpSchema } from "@/lib/validation/assistant";

const L = LABELS.followUp;
const CHANNELS = ["phone", "whatsapp", "in_person"] as const;
const TYPES = ["payment", "absence"] as const;

type FollowUpDialogProps = {
  studentId: string;
  studentName: string;
  /** Facture en retard la plus ancienne, rattachée aux relances de paiement. */
  invoiceId: string | null;
  defaultType: FollowUpInput["type"];
  /** « compact » : bouton court pour les listes. */
  triggerVariant?: "default" | "compact";
};

export function FollowUpDialog({
  studentId,
  studentName,
  invoiceId,
  defaultType,
  triggerVariant = "default",
}: FollowUpDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const form = useForm<FollowUpInput>({
    resolver: zodResolver(followUpSchema),
    defaultValues: { studentId, invoiceId, type: defaultType, channel: "phone", note: "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await recordFollowUp(values);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(L.dialog.success);
      setOpen(false);
      form.reset({ studentId, invoiceId, type: defaultType, channel: "phone", note: "" });
    });
  });

  const noteError = form.formState.errors.note?.message;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" aria-label={triggerVariant === "compact" ? `${L.dialog.trigger} (${L.types[defaultType].toLowerCase()}) — ${studentName}` : undefined}>
          <MessageSquarePlus aria-hidden />
          {triggerVariant === "compact" ? L.dialog.triggerShort : L.dialog.trigger}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle className="text-section">{L.dialog.title}</DialogTitle>
            <DialogDescription>{L.dialog.description(studentName)}</DialogDescription>
          </DialogHeader>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-body font-medium">{L.dialog.type}</legend>
            <Controller
              control={form.control}
              name="type"
              render={({ field }) => (
                <RadioGroup value={field.value} onValueChange={field.onChange} className="grid-cols-2">
                  {TYPES.map((type) => (
                    <ChoiceItem key={type}>
                      <RadioGroupItem value={type} />
                      {L.types[type]}
                    </ChoiceItem>
                  ))}
                </RadioGroup>
              )}
            />
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-body font-medium">{L.dialog.channel}</legend>
            <Controller
              control={form.control}
              name="channel"
              render={({ field }) => (
                <RadioGroup value={field.value} onValueChange={field.onChange}>
                  {CHANNELS.map((channel) => (
                    <ChoiceItem key={channel}>
                      <RadioGroupItem value={channel} />
                      {L.channels[channel]}
                    </ChoiceItem>
                  ))}
                </RadioGroup>
              )}
            />
          </fieldset>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`note-${studentId}`}>{L.dialog.note}</Label>
            <Textarea
              id={`note-${studentId}`}
              rows={3}
              placeholder={L.dialog.notePlaceholder}
              aria-invalid={noteError ? true : undefined}
              aria-describedby={noteError ? `note-${studentId}-error` : undefined}
              {...form.register("note")}
            />
            {noteError ? (
              <p id={`note-${studentId}-error`} className="text-caption text-danger-ink">
                {noteError}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {LABELS.common.cancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
              {L.dialog.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
