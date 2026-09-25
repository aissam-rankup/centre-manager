"use client";

import type { ReactElement } from "react";
import { Controller, useWatch } from "react-hook-form";

import { FormDialog } from "@/components/admin/form-dialog";
import { useActionForm } from "@/components/admin/use-action-form";
import { ChoiceItem } from "@/components/shared/choice-item";
import { FormField } from "@/components/shared/form-field";
import { Money } from "@/components/shared/money";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { savePack, saveLevel, saveSubject } from "@/lib/actions/admin";
import { LABELS } from "@/lib/constants/labels";
import { formatMAD } from "@/lib/format";
import { levelSchema, packSchema, subjectSchema } from "@/lib/validation/admin";

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

type PackDialogProps = {
  trigger: ReactElement;
  levelId: string;
  levelName: string;
  subjects: { id: string; name: string; monthlyPrice: number }[];
  pack?: { id: string; name: string; monthlyPrice: number; active: boolean; subjectIds: string[] };
};

export function PackDialog({ trigger, levelId, levelName, subjects, pack }: PackDialogProps) {
  const { form, open, onOpenChange, onSubmit, pending, error } = useActionForm({
    schema: packSchema,
    defaultValues: {
      id: pack?.id ?? null,
      levelId,
      name: pack?.name ?? "",
      monthlyPrice: pack?.monthlyPrice ?? 0,
      active: pack?.active ?? true,
      subjectIds: pack?.subjectIds ?? subjects.map((subject) => subject.id),
    },
    action: savePack,
    successMessage: pack ? LABELS.admin.common.saved : LABELS.admin.common.created,
  });
  const errors = form.formState.errors;
  const selectedIds = useWatch({ control: form.control, name: "subjectIds" }) ?? [];
  // Repère pour fixer le prix : total des matières cochées vendues à l'unité.
  const unitTotal = subjects
    .filter((subject) => selectedIds.includes(subject.id))
    .reduce((sum, subject) => sum + subject.monthlyPrice, 0);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      title={pack ? L.editPack : L.newPack}
      description={`${L.level} : ${levelName}`}
      pending={pending}
      error={error}
      onSubmit={onSubmit}
    >
      <FormField id="pack-name" label={L.packName} error={errors.name?.message}>
        <Input placeholder={L.packNamePlaceholder} {...form.register("name")} />
      </FormField>

      <fieldset className="flex flex-col gap-2">
        <div className="flex items-end justify-between gap-3">
          <legend className="font-medium">{L.packSubjects}</legend>
          <Button
            type="button"
            variant="ghost"
            className="-mr-3"
            onClick={() => form.setValue("subjectIds", subjects.map((subject) => subject.id), { shouldValidate: true })}
          >
            {L.selectAll}
          </Button>
        </div>
        <p className="text-caption text-muted-foreground">{L.packSubjectsHint}</p>
        <Controller
          control={form.control}
          name="subjectIds"
          render={({ field }) => (
            <div className="flex flex-col gap-2">
              {subjects.map((subject) => (
                <ChoiceItem key={subject.id}>
                  <Checkbox
                    checked={field.value.includes(subject.id)}
                    onCheckedChange={(value) => {
                      // Valeur lue au moment du clic : fiable même pour des clics rapprochés.
                      const current = form.getValues("subjectIds");
                      field.onChange(
                        value === true
                          ? [...new Set([...current, subject.id])]
                          : current.filter((id) => id !== subject.id),
                      );
                    }}
                  />
                  <span className="flex-1">{subject.name}</span>
                  <Money amount={subject.monthlyPrice} className="text-muted-foreground" />
                </ChoiceItem>
              ))}
            </div>
          )}
        />
        {errors.subjectIds ? <p className="text-caption text-danger-ink">{errors.subjectIds.message}</p> : null}
      </fieldset>

      <FormField
        id="pack-price"
        label={L.packPrice}
        hint={pack ? `${L.unitTotal(formatMAD(unitTotal))} ${L.packPriceHint}` : L.unitTotal(formatMAD(unitTotal))}
        error={errors.monthlyPrice?.message}
      >
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step={10}
          className="numeric w-40 font-normal"
          {...form.register("monthlyPrice")}
        />
      </FormField>

      <Controller
        control={form.control}
        name="active"
        render={({ field }) => (
          <ChoiceItem>
            <Checkbox checked={field.value} onCheckedChange={(value) => field.onChange(value === true)} />
            <span className="flex-1">{L.packActive}</span>
          </ChoiceItem>
        )}
      />
    </FormDialog>
  );
}
