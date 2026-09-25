"use client";

import type { ReactElement } from "react";

import { FormDialog } from "@/components/admin/form-dialog";
import { useActionForm } from "@/components/admin/use-action-form";
import { FormField } from "@/components/shared/form-field";
import { Input } from "@/components/ui/input";
import { saveLevel, saveSubject } from "@/lib/actions/admin";
import { LABELS } from "@/lib/constants/labels";
import { levelSchema, subjectSchema } from "@/lib/validation/admin";

const L = LABELS.admin.subjects;

type LevelDialogProps = {
  trigger: ReactElement;
  level?: { id: string; name: string; sortOrder: number };
  nextSortOrder: number;
};

export function LevelDialog({ trigger, level, nextSortOrder }: LevelDialogProps) {
  const { form, open, onOpenChange, onSubmit, pending, error } = useActionForm({
    schema: levelSchema,
    defaultValues: { id: level?.id ?? null, name: level?.name ?? "", sortOrder: level?.sortOrder ?? nextSortOrder },
    action: saveLevel,
    successMessage: level ? LABELS.admin.common.saved : LABELS.admin.common.created,
  });
  const errors = form.formState.errors;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      title={level ? L.editLevel : L.newLevel}
      pending={pending}
      error={error}
      onSubmit={onSubmit}
    >
      <FormField id="level-name" label={L.levelName} error={errors.name?.message}>
        <Input placeholder={L.levelNamePlaceholder} {...form.register("name")} />
      </FormField>
      <FormField id="level-sort" label={L.sortOrder} hint={L.sortOrderHint} error={errors.sortOrder?.message}>
        <Input type="number" inputMode="numeric" min={0} className="numeric w-32 font-normal" {...form.register("sortOrder")} />
      </FormField>
    </FormDialog>
  );
}

type SubjectDialogProps = {
  trigger: ReactElement;
  levelId: string;
  levelName: string;
  subject?: { id: string; name: string; monthlyPrice: number };
};

export function SubjectDialog({ trigger, levelId, levelName, subject }: SubjectDialogProps) {
  const { form, open, onOpenChange, onSubmit, pending, error } = useActionForm({
    schema: subjectSchema,
    defaultValues: { id: subject?.id ?? null, levelId, name: subject?.name ?? "", monthlyPrice: subject?.monthlyPrice ?? 0 },
    action: saveSubject,
    successMessage: subject ? LABELS.admin.common.saved : LABELS.admin.common.created,
  });
  const errors = form.formState.errors;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      title={subject ? L.editSubject : L.newSubject}
      description={`${L.level} : ${levelName}`}
      pending={pending}
      error={error}
      onSubmit={onSubmit}
    >
      <FormField id="subject-name" label={L.subjectName} error={errors.name?.message}>
        <Input placeholder={L.subjectNamePlaceholder} {...form.register("name")} />
      </FormField>
      <FormField id="subject-price" label={L.price} hint={L.priceHint} error={errors.monthlyPrice?.message}>
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step={10}
          className="numeric w-40 font-normal"
          {...form.register("monthlyPrice")}
        />
      </FormField>
    </FormDialog>
  );
}
