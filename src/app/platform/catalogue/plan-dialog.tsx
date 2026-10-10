"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Pencil } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updatePlan } from "@/lib/actions/platform";
import { useLabels, useMessage } from "@/lib/i18n/client";
import { type PlanInput, planSchema } from "@/lib/validation/platform";

/** Nom, description et prix catalogue d'un pack (sa composition est fixée par les migrations). */
export function PlanDialog({ defaults }: { defaults: PlanInput }) {
  const LABELS = useLabels();
  const C = LABELS.platform.catalogue;
  const A = LABELS.platform.actions;
  const message = useMessage();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<PlanInput>({ resolver: zodResolver(planSchema), defaultValues: defaults });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await updatePlan(values);
      if (!result.ok) {
        toast.error(message(result.error));
        return;
      }
      toast.success(C.saved);
      setOpen(false);
    }),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(defaults);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil aria-hidden />
          {C.edit}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{C.editTitle(defaults.name)}</DialogTitle>
        </DialogHeader>
        <form id={`plan-${defaults.key}`} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <FormField id={`plan-name-${defaults.key}`} label={C.name} error={errors.name?.message}>
            <Input autoComplete="off" {...form.register("name")} />
          </FormField>
          <FormField id={`plan-description-${defaults.key}`} label={C.descriptionLabel} error={errors.description?.message}>
            <Textarea rows={3} {...form.register("description")} />
          </FormField>
          <FormField id={`plan-price-${defaults.key}`} label={C.monthlyPrice} error={errors.monthlyPrice?.message}>
            <Input inputMode="decimal" autoComplete="off" {...form.register("monthlyPrice")} />
          </FormField>
        </form>
        <DialogFooter>
          <Button type="submit" form={`plan-${defaults.key}`} disabled={pending}>
            {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
            {pending ? A.saving : A.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
