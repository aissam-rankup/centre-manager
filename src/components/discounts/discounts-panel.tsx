"use client";

import { Pencil, Plus, Power, PowerOff, Tag, Trash2, TriangleAlert } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { FormDialog } from "@/components/admin/form-dialog";
import { useActionForm } from "@/components/admin/use-action-form";
import { DiscountBadge } from "@/components/discounts/discount-badge";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form-field";
import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { deleteDiscount, saveDiscount, setDiscountActive } from "@/lib/actions/discounts";
import {
  DISCOUNT_REASONS,
  DISCOUNT_SCOPES,
  DISCOUNT_TYPES,
  discountScopeLabel,
  discountState,
  type StudentDiscount,
} from "@/lib/discounts";
import { formatDate } from "@/lib/format";
import { useLabels } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { type DiscountFormValues, discountSchemas } from "@/lib/validation/discounts";

export type DiscountTargetOption = { value: string; label: string };

type DiscountsPanelProps = {
  studentId: string;
  discounts: StudentDiscount[];
  /** Admin : création et modification ; accueil : lecture seule. */
  canEdit: boolean;
  /** Matières et packs du niveau (« subject:<id> », « pack:<id> »). */
  targets: DiscountTargetOption[];
  todayIso: string;
};

const STATE_TONE = {
  active: "text-success-ink",
  upcoming: "text-muted-foreground",
  inactive: "text-muted-foreground",
  expired: "text-muted-foreground",
} as const;

export function DiscountsPanel({ studentId, discounts, canEdit, targets, todayIso }: DiscountsPanelProps) {
  const LABELS = useLabels();
  const L = LABELS.discounts;

  return (
    <SectionCard
      id="remises"
      title={L.title}
      description={canEdit ? undefined : L.readOnlyHint}
      aside={canEdit ? <DiscountFormDialog studentId={studentId} targets={targets} todayIso={todayIso} /> : null}
    >
      {discounts.length === 0 ? (
        <EmptyState
          icon={Tag}
          title={L.emptyTitle}
          description={canEdit ? L.emptyAdminDescription : L.emptyDescription}
          className="py-8 shadow-none"
        />
      ) : (
        <ul className="flex flex-col divide-y">
          {discounts.map((discount) => (
            <DiscountRow
              key={discount.id}
              discount={discount}
              canEdit={canEdit}
              studentId={studentId}
              targets={targets}
              todayIso={todayIso}
            />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function DiscountRow({
  discount,
  canEdit,
  studentId,
  targets,
  todayIso,
}: {
  discount: StudentDiscount;
  canEdit: boolean;
  studentId: string;
  targets: DiscountTargetOption[];
  todayIso: string;
}) {
  const LABELS = useLabels();
  const L = LABELS.discounts;
  const state = discountState(discount, todayIso);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    startTransition(async () => {
      const result = await setDiscountActive({ id: discount.id, active: !discount.isActive });
      if (result.ok) toast.success(discount.isActive ? L.form.deactivated : L.form.activated);
      else toast.error(result.error);
    });
  };

  const validity = discount.validTo
    ? L.validRange(formatDate(discount.validFrom), formatDate(discount.validTo))
    : L.validFrom(formatDate(discount.validFrom));

  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <div className={cn("flex min-w-0 flex-col gap-1", state !== "active" && "opacity-70")}>
        <DiscountBadge discount={discount} />
        <span className="text-caption text-muted-foreground">
          {L.appliesTo(discountScopeLabel(discount, LABELS))} · {validity}
        </span>
        <span className="text-caption">
          <span className={cn("font-medium", STATE_TONE[state])}>{L.states[state]}</span>
          <span className="text-muted-foreground">
            {" · "}
            {discount.grantedByName
              ? L.grantedBy(discount.grantedByName, formatDate(discount.grantedAt))
              : L.grantedOn(formatDate(discount.grantedAt))}
          </span>
        </span>
        {discount.conflict && state === "active" ? (
          <span className="flex items-start gap-1.5 text-caption font-medium text-warning-ink">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {L.conflict}
          </span>
        ) : null}
      </div>

      {canEdit ? (
        <div className="flex shrink-0 flex-wrap gap-2">
          <DiscountFormDialog studentId={studentId} targets={targets} todayIso={todayIso} discount={discount} />
          <Button variant="outline" onClick={toggle} disabled={pending}>
            {discount.isActive ? <PowerOff aria-hidden /> : <Power aria-hidden />}
            {discount.isActive ? L.deactivate : L.activate}
          </Button>
          <ConfirmAction
            trigger={
              <Button variant="ghost" aria-label={L.delete}>
                <Trash2 aria-hidden />
              </Button>
            }
            title={L.form.deleteTitle}
            description={L.form.deleteDescription}
            confirmLabel={L.delete}
            successMessage={L.form.deleted}
            action={() => deleteDiscount(discount.id)}
          />
        </div>
      ) : null}
    </li>
  );
}

function DiscountFormDialog({
  studentId,
  targets,
  todayIso,
  discount,
}: {
  studentId: string;
  targets: DiscountTargetOption[];
  todayIso: string;
  discount?: StudentDiscount;
}) {
  const LABELS = useLabels();
  const L = LABELS.discounts;
  const F = L.form;

  const target = discount?.subjectId
    ? `subject:${discount.subjectId}`
    : discount?.packId
      ? `pack:${discount.packId}`
      : "";
  const defaultValues: DiscountFormValues = {
    id: discount?.id,
    studentId,
    type: discount?.type ?? "percentage",
    value: discount ? String(discount.value) : "",
    scope: discount?.scope ?? "all_subjects",
    target,
    reason: discount?.reason ?? "sibling",
    reasonNote: discount?.reasonNote ?? "",
    validFrom: discount?.validFrom ?? todayIso,
    validTo: discount?.validTo ?? "",
  };

  const { form, open, onOpenChange, onSubmit, pending, error } = useActionForm({
    schema: discountSchemas(LABELS).discountSchema,
    defaultValues,
    action: saveDiscount,
    successMessage: F.saved,
  });
  const errors = form.formState.errors;
  const type = form.watch("type");
  const scope = form.watch("scope");
  const reason = form.watch("reason");
  const idPrefix = discount ? `remise-${discount.id}` : "remise-nouvelle";

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={discount ? F.editTitle : F.title}
      description={F.description}
      pending={pending}
      error={error}
      submitLabel={F.save}
      onSubmit={onSubmit}
      trigger={
        discount ? (
          <Button variant="outline">
            <Pencil aria-hidden />
            {LABELS.admin.common.edit}
          </Button>
        ) : (
          <Button>
            <Plus aria-hidden />
            {L.add}
          </Button>
        )
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={`${idPrefix}-type`} label={F.type} error={errors.type?.message}>
          <NativeSelect {...form.register("type")}>
            {DISCOUNT_TYPES.map((value) => (
              <option key={value} value={value}>
                {L.types[value]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField
          id={`${idPrefix}-valeur`}
          label={type === "percentage" ? F.percentValue : F.amountValue}
          hint={type === "fixed_amount" ? F.amountHint : undefined}
          error={errors.value?.message}
        >
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            max={type === "percentage" ? 100 : undefined}
            step={type === "percentage" ? 1 : 10}
            className="numeric font-normal"
            {...form.register("value")}
          />
        </FormField>
      </div>

      <FormField id={`${idPrefix}-portee`} label={F.scope} error={errors.scope?.message}>
        <NativeSelect {...form.register("scope")}>
          {DISCOUNT_SCOPES.map((value) => (
            <option key={value} value={value}>
              {L.scopes[value]}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      {scope === "specific_subject" ? (
        <FormField id={`${idPrefix}-cible`} label={F.target} error={errors.target?.message}>
          <NativeSelect {...form.register("target")}>
            <option value="">{F.chooseTarget}</option>
            {targets.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={`${idPrefix}-motif`} label={F.reason} error={errors.reason?.message}>
          <NativeSelect {...form.register("reason")}>
            {DISCOUNT_REASONS.map((value) => (
              <option key={value} value={value}>
                {L.reasonOptions[value]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField
          id={`${idPrefix}-precision`}
          label={F.reasonNote}
          hint={reason === "other" ? F.reasonNoteHint : undefined}
          error={errors.reasonNote?.message}
        >
          <Input maxLength={200} {...form.register("reasonNote")} />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={`${idPrefix}-debut`} label={F.validFrom} error={errors.validFrom?.message}>
          <Input type="date" className="numeric font-normal" {...form.register("validFrom")} />
        </FormField>
        <FormField id={`${idPrefix}-fin`} label={F.validTo} hint={F.validToHint} error={errors.validTo?.message}>
          <Input type="date" className="numeric font-normal" {...form.register("validTo")} />
        </FormField>
      </div>
    </FormDialog>
  );
}
