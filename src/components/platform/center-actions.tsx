"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Ban,
  CalendarClock,
  CircleCheck,
  LifeBuoy,
  LoaderCircle,
  type LucideIcon,
  Pencil,
  PauseCircle,
  Send,
  Tags,
  Wallet,
} from "lucide-react";
import { type ReactNode, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { AccessLinkDialog } from "@/components/platform/access-link-dialog";
import { PlanChoice } from "@/components/platform/plan-choice";
import { VocabularyPicker } from "@/components/platform/vocabulary-picker";
import { ChoiceItem } from "@/components/shared/choice-item";
import { FormField } from "@/components/shared/form-field";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions/result";
import {
  recordSubscriptionPayment,
  resendInvitation,
  updateCenterDetails,
  updateCenterDueDate,
  updateCenterPricing,
  updateCenterStatus,
} from "@/lib/actions/platform";
import { startSupport } from "@/lib/actions/support";
import { LABELS } from "@/lib/constants/labels";
import type { BillingInterval, CenterStatus, CenterTypeOption, PlanOption } from "@/lib/data/platform";
import {
  type CenterDetailsInput,
  centerDetailsSchema,
  type CenterPricingInput,
  centerPricingSchema,
  type CenterStatusInput,
  centerStatusSchema,
  type CustomTermsInput,
  type DueDateInput,
  dueDateSchema,
  type SubscriptionPaymentInput,
  subscriptionPaymentSchema,
} from "@/lib/validation/platform";

const P = LABELS.platform;
const A = P.actions;
const N = P.newCenter;

/** Données de la fiche nécessaires aux formulaires. */
export type CenterActionsData = {
  centerId: string;
  status: CenterStatus;
  name: string;
  slug: string;
  centerType: string;
  customTerms: CustomTermsInput;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  notes: string;
  /** Clé du pack du centre. */
  plan: string;
  /** Packs du catalogue. */
  plans: PlanOption[];
  price: number | null;
  billingInterval: BillingInterval;
  graceDays: number;
  dueDate: string | null;
  todayIso: string;
};

type ActionDialogProps = {
  trigger: string;
  icon: LucideIcon;
  title: string;
  description?: string;
  variant?: "default" | "outline" | "destructive";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  submitLabel?: string;
  onSubmit: () => void;
  children: ReactNode;
};

function ActionDialog({
  trigger,
  icon: Icon,
  title,
  description,
  variant = "outline",
  open,
  onOpenChange,
  pending,
  submitLabel = A.save,
  onSubmit,
  children,
}: ActionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant={variant}>
          <Icon aria-hidden />
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-section">{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          {children}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              {LABELS.common.cancel}
            </Button>
            <Button type="submit" variant={variant === "destructive" ? "destructive" : "default"} disabled={pending}>
              {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
              {pending ? A.saving : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Ouverture, envoi et retour d'une action : toast, fermeture, erreurs de champs. */
function useAction<T>(action: (input: T) => Promise<ActionResult>, successMessage: string) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const run = (values: T, onFieldErrors?: (errors: Record<string, string>) => void) =>
    startTransition(async () => {
      const result = await action(values);
      if (!result.ok) {
        toast.error(result.error);
        if (result.fieldErrors) onFieldErrors?.(result.fieldErrors);
        return;
      }
      toast.success(successMessage);
      setOpen(false);
    });
  return { open, setOpen, pending, run };
}

// ---------------------------------------------------------------------
// Paiement
// ---------------------------------------------------------------------
function PaymentDialog({ data }: { data: CenterActionsData }) {
  const { open, setOpen, pending, run } = useAction(recordSubscriptionPayment, A.paymentSaved);
  const defaults: SubscriptionPaymentInput = {
    centerId: data.centerId,
    amount: data.price !== null ? String(data.price) : "",
    paidAt: data.todayIso,
    method: "bank_transfer",
    reference: "",
  };
  const form = useForm<SubscriptionPaymentInput>({ resolver: zodResolver(subscriptionPaymentSchema), defaultValues: defaults });
  const errors = form.formState.errors;

  return (
    <ActionDialog
      trigger={A.recordPayment}
      icon={Wallet}
      variant="default"
      title={A.paymentTitle}
      description={A.paymentDescription(data.billingInterval === "year" ? A.periodYear : A.periodMonth)}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(defaults);
      }}
      pending={pending}
      onSubmit={() => void form.handleSubmit((values) => run(values))()}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="payment-amount" label={A.paymentAmount} error={errors.amount?.message}>
          <Input inputMode="decimal" autoComplete="off" {...form.register("amount")} />
        </FormField>
        <FormField id="payment-date" label={A.paymentDate} error={errors.paidAt?.message}>
          <Input type="date" max={data.todayIso} className="numeric font-normal" {...form.register("paidAt")} />
        </FormField>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-body font-medium">{A.paymentMethod}</legend>
        <Controller
          control={form.control}
          name="method"
          render={({ field }) => (
            <RadioGroup value={field.value} onValueChange={field.onChange} className="sm:grid-cols-3">
              {(["bank_transfer", "cash", "card"] as const).map((method) => (
                <ChoiceItem key={method}>
                  <RadioGroupItem value={method} />
                  {P.paymentMethod[method]}
                </ChoiceItem>
              ))}
            </RadioGroup>
          )}
        />
      </fieldset>
      <FormField id="payment-reference" label={A.paymentReference} hint={A.paymentReferenceHint} error={errors.reference?.message}>
        <Input autoComplete="off" {...form.register("reference")} />
      </FormField>
    </ActionDialog>
  );
}

// ---------------------------------------------------------------------
// Échéance
// ---------------------------------------------------------------------
function DueDateDialog({ data }: { data: CenterActionsData }) {
  const { open, setOpen, pending, run } = useAction(updateCenterDueDate, A.saved);
  const defaults: DueDateInput = { centerId: data.centerId, dueDate: data.dueDate ?? data.todayIso, reason: "" };
  const form = useForm<DueDateInput>({ resolver: zodResolver(dueDateSchema), defaultValues: defaults });
  const errors = form.formState.errors;

  return (
    <ActionDialog
      trigger={A.dueDate}
      icon={CalendarClock}
      title={A.dueDateTitle}
      description={A.dueDateDescription}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(defaults);
      }}
      pending={pending}
      onSubmit={() => void form.handleSubmit((values) => run(values))()}
    >
      <FormField id="due-date" label={A.newDueDate} error={errors.dueDate?.message}>
        <Input type="date" className="numeric font-normal" {...form.register("dueDate")} />
      </FormField>
      <FormField id="due-reason" label={A.reasonOptional} error={errors.reason?.message}>
        <Textarea rows={2} placeholder={A.reasonPlaceholder} {...form.register("reason")} />
      </FormField>
    </ActionDialog>
  );
}

// ---------------------------------------------------------------------
// Pack et tarif
// ---------------------------------------------------------------------
function PricingDialog({ data }: { data: CenterActionsData }) {
  const { open, setOpen, pending, run } = useAction(updateCenterPricing, A.saved);
  const defaults: CenterPricingInput = {
    centerId: data.centerId,
    plan: data.plan,
    price: data.price !== null ? String(data.price) : "",
    billingInterval: data.billingInterval,
    graceDays: String(data.graceDays),
  };
  const form = useForm<CenterPricingInput>({ resolver: zodResolver(centerPricingSchema), defaultValues: defaults });
  const errors = form.formState.errors;

  return (
    <ActionDialog
      trigger={A.pricing}
      icon={Tags}
      title={A.pricingTitle}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(defaults);
      }}
      pending={pending}
      onSubmit={() => void form.handleSubmit((values) => run(values))()}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-body font-medium">{N.plan}</legend>
        <Controller
          control={form.control}
          name="plan"
          render={({ field }) => <PlanChoice plans={data.plans} value={field.value} onChange={field.onChange} />}
        />
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="pricing-price" label={N.price} error={errors.price?.message}>
          <Input inputMode="decimal" autoComplete="off" {...form.register("price")} />
        </FormField>
        <FormField id="pricing-grace" label={N.graceDays} error={errors.graceDays?.message}>
          <Input inputMode="numeric" autoComplete="off" {...form.register("graceDays")} />
        </FormField>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-body font-medium">{N.interval}</legend>
        <Controller
          control={form.control}
          name="billingInterval"
          render={({ field }) => (
            <RadioGroup value={field.value} onValueChange={field.onChange} className="grid-cols-2">
              {(["month", "year"] as const).map((value) => (
                <ChoiceItem key={value}>
                  <RadioGroupItem value={value} />
                  {N.intervalOptions[value]}
                </ChoiceItem>
              ))}
            </RadioGroup>
          )}
        />
      </fieldset>
    </ActionDialog>
  );
}

// ---------------------------------------------------------------------
// Informations et vocabulaire
// ---------------------------------------------------------------------
function DetailsDialog({ data, types }: { data: CenterActionsData; types: CenterTypeOption[] }) {
  const { open, setOpen, pending, run } = useAction(updateCenterDetails, A.saved);
  const defaults: CenterDetailsInput = {
    centerId: data.centerId,
    name: data.name,
    slug: data.slug,
    ownerName: data.ownerName,
    ownerPhone: data.ownerPhone,
    ownerEmail: data.ownerEmail,
    notes: data.notes,
    centerType: data.centerType,
    customTerms: data.customTerms,
  };
  const form = useForm<CenterDetailsInput>({ resolver: zodResolver(centerDetailsSchema), defaultValues: defaults });
  const errors = form.formState.errors;
  const centerType = useWatch({ control: form.control, name: "centerType" });

  const flatErrors: Record<string, string | undefined> = { centerType: errors.centerType?.message };
  for (const key of ["learner", "group", "course", "instructor", "session"] as const) {
    flatErrors[`customTerms.${key}.singular`] = errors.customTerms?.[key]?.singular?.message;
    flatErrors[`customTerms.${key}.plural`] = errors.customTerms?.[key]?.plural?.message;
  }

  return (
    <ActionDialog
      trigger={A.details}
      icon={Pencil}
      title={A.detailsTitle}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(defaults);
      }}
      pending={pending}
      onSubmit={() =>
        void form.handleSubmit((values) =>
          run(values, (fieldErrors) => {
            if (fieldErrors.slug) form.setError("slug", { message: fieldErrors.slug });
          }),
        )()
      }
    >
      <FormField id="details-name" label={N.name} error={errors.name?.message}>
        <Input autoComplete="off" {...form.register("name")} />
      </FormField>
      <FormField id="details-slug" label={N.slug} hint={N.slugHint} error={errors.slug?.message}>
        <Input autoComplete="off" autoCapitalize="none" {...form.register("slug")} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="details-owner" label={N.ownerName} error={errors.ownerName?.message}>
          <Input autoComplete="off" {...form.register("ownerName")} />
        </FormField>
        <FormField id="details-phone" label={N.ownerPhone} error={errors.ownerPhone?.message}>
          <Input type="tel" inputMode="tel" autoComplete="off" {...form.register("ownerPhone")} />
        </FormField>
      </div>
      <FormField id="details-email" label={N.ownerEmail} error={errors.ownerEmail?.message}>
        <Input type="email" inputMode="email" autoCapitalize="none" autoComplete="off" {...form.register("ownerEmail")} />
      </FormField>
      <FormField id="details-notes" label={N.notes} hint={N.notesHint} error={errors.notes?.message}>
        <Textarea rows={3} {...form.register("notes")} />
      </FormField>
      <Controller
        control={form.control}
        name="customTerms"
        render={({ field }) => (
          <VocabularyPicker
            types={types}
            centerType={centerType}
            customTerms={field.value}
            onTypeChange={(code) => form.setValue("centerType", code, { shouldValidate: true })}
            onTermsChange={field.onChange}
            errors={flatErrors}
            idPrefix="fiche"
          />
        )}
      />
    </ActionDialog>
  );
}

// ---------------------------------------------------------------------
// Statut
// ---------------------------------------------------------------------
type ManualStatus = CenterStatusInput["status"];

const STATUS_ACTION: Record<ManualStatus, { trigger: string; icon: LucideIcon; variant: "outline" | "destructive" }> = {
  active: { trigger: A.reactivate, icon: CircleCheck, variant: "outline" },
  suspended: { trigger: A.suspend, icon: PauseCircle, variant: "outline" },
  cancelled: { trigger: A.cancel, icon: Ban, variant: "destructive" },
};

function StatusDialog({ centerId, status }: { centerId: string; status: ManualStatus }) {
  const { open, setOpen, pending, run } = useAction(updateCenterStatus, A.statusSaved[status]);
  const defaults: CenterStatusInput = { centerId, status, reason: "" };
  const form = useForm<CenterStatusInput>({ resolver: zodResolver(centerStatusSchema), defaultValues: defaults });
  const error = form.formState.errors.reason?.message;
  const config = STATUS_ACTION[status];

  return (
    <ActionDialog
      trigger={config.trigger}
      icon={config.icon}
      variant={config.variant}
      title={A.statusTitle[status]}
      description={A.statusDescription[status]}
      submitLabel={config.trigger}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(defaults);
      }}
      pending={pending}
      onSubmit={() => void form.handleSubmit((values) => run(values))()}
    >
      <FormField id={`status-reason-${status}`} label={A.reason} error={error}>
        <Textarea rows={2} placeholder={A.reasonPlaceholder} {...form.register("reason")} />
      </FormField>
    </ActionDialog>
  );
}

// ---------------------------------------------------------------------
// Accès support (lecture seule)
// ---------------------------------------------------------------------
function SupportDialog({ centerId }: { centerId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <ActionDialog
      trigger={A.support}
      icon={LifeBuoy}
      title={A.supportTitle}
      description={A.supportDescription}
      submitLabel={A.supportSubmit}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setReason("");
          setError(null);
        }
      }}
      pending={pending}
      onSubmit={() => {
        if (!reason.trim()) {
          setError(P.validation.reasonRequired);
          return;
        }
        startTransition(async () => {
          // Succès : redirection vers l'espace administration du centre.
          const result = await startSupport({ centerId, reason });
          if (result && !result.ok) toast.error(result.error);
        });
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="support-reason">{A.reason}</Label>
        <Textarea
          id="support-reason"
          rows={2}
          value={reason}
          placeholder={A.supportReasonPlaceholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "support-reason-erreur" : undefined}
          onChange={(event) => setReason(event.target.value)}
        />
        {error ? (
          <p id="support-reason-erreur" className="text-caption text-danger-ink">
            {error}
          </p>
        ) : null}
      </div>
    </ActionDialog>
  );
}

/** Boutons d'action de la fiche centre, selon son statut. */
export function CenterActions({ data, types }: { data: CenterActionsData; types: CenterTypeOption[] }) {
  // Centre résilié : consultation seule (export des données sur demande).
  if (data.status === "cancelled") {
    return (
      <div className="flex flex-wrap gap-2">
        <SupportDialog centerId={data.centerId} />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <SupportDialog centerId={data.centerId} />
      <PaymentDialog data={data} />
      <DueDateDialog data={data} />
      <PricingDialog data={data} />
      <DetailsDialog data={data} types={types} />
      {data.status === "suspended" ? (
        <StatusDialog centerId={data.centerId} status="active" />
      ) : (
        <StatusDialog centerId={data.centerId} status="suspended" />
      )}
      <StatusDialog centerId={data.centerId} status="cancelled" />
    </div>
  );
}

/** Invitation renvoyée (jamais connecté) ou lien de mot de passe (déjà connecté). */
export function ResendInvitationButton({
  centerId,
  userId,
  name,
  email,
  signedIn,
}: {
  centerId: string;
  userId: string;
  name: string;
  email: string;
  signedIn: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const label = signedIn ? A.passwordLink : A.resendInvitation;
  return (
    <>
    <AccessLinkDialog link={link} email={email} onClose={() => setLink(null)} />
    <Button
      variant="ghost"
      disabled={pending}
      aria-label={`${label} — ${name}`}
      onClick={() =>
        startTransition(async () => {
          const result = await resendInvitation({ centerId, userId });
          if (!result.ok) toast.error(result.error);
          else if (result.data.link) setLink(result.data.link);
          else toast.success(result.data.passwordLink ? A.passwordLinkSent : A.invitationSent);
        })
      }
    >
      {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Send aria-hidden />}
      {label}
    </Button>
    </>
  );
}
