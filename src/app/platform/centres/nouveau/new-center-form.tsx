"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Building2, Check, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { VocabularyPicker } from "@/components/platform/vocabulary-picker";
import { ChoiceItem } from "@/components/shared/choice-item";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { createCenter } from "@/lib/actions/platform";
import { ROUTES } from "@/lib/auth/routes";
import { addBillingInterval } from "@/lib/billing-interval";
import { LABELS } from "@/lib/constants/labels";
import type { CenterTypeOption } from "@/lib/data/platform";
import { formatDate, formatMAD } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  CUSTOM_CENTER_TYPE,
  EMPTY_TERMS,
  NEW_CENTER_STEP_FIELDS,
  type NewCenterInput,
  newCenterSchema,
  VOCABULARY_KEYS,
} from "@/lib/validation/platform";

const P = LABELS.platform;
const L = P.newCenter;
const STEP_COUNT = L.steps.length;

/** « Centre Élan — Rabat » → « centre-elan-rabat » */
function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

type NewCenterFormProps = {
  types: CenterTypeOption[];
  /** Date du jour à Casablanca (AAAA-MM-JJ). */
  todayIso: string;
};

export function NewCenterForm({ types, todayIso }: NewCenterFormProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [slugEdited, setSlugEdited] = useState(false);
  const [dueEdited, setDueEdited] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Focus sur le titre après un changement d'étape (pas au premier affichage).
  const [stepChanged, setStepChanged] = useState(false);

  useEffect(() => {
    if (stepChanged) headingRef.current?.focus();
  }, [step, stepChanged]);

  const form = useForm<NewCenterInput>({
    resolver: zodResolver(newCenterSchema),
    defaultValues: {
      name: "",
      slug: "",
      ownerName: "",
      ownerPhone: "",
      ownerEmail: "",
      notes: "",
      centerType: types[0]?.code ?? "",
      customTerms: EMPTY_TERMS,
      plan: "standard",
      price: "",
      billingInterval: "month",
      graceDays: "5",
      status: "active",
      activationDate: todayIso,
      firstDueDate: addBillingInterval(todayIso, "month"),
      adminName: "",
      adminEmail: "",
      adminPhone: "",
    },
    mode: "onTouched",
  });
  const { register, control, formState, setValue, trigger, setError, clearErrors, getValues } = form;
  const errors = formState.errors;

  const [billingInterval, activationDate, centerType, plan, price, status, name, slug, firstDueDate] = useWatch({
    control,
    name: ["billingInterval", "activationDate", "centerType", "plan", "price", "status", "name", "slug", "firstDueDate"],
  });

  // Première échéance proposée : activation + la durée facturée, tant qu'elle n'a pas été modifiée à la main.
  useEffect(() => {
    if (!dueEdited && /^\d{4}-\d{2}-\d{2}$/.test(activationDate)) {
      setValue("firstDueDate", addBillingInterval(activationDate, billingInterval));
    }
  }, [activationDate, billingInterval, dueEdited, setValue]);

  const flatErrors: Record<string, string | undefined> = {
    centerType: errors.centerType?.message,
  };
  for (const key of ["learner", "group", "course", "instructor", "session"] as const) {
    flatErrors[`customTerms.${key}.singular`] = errors.customTerms?.[key]?.singular?.message;
    flatErrors[`customTerms.${key}.plural`] = errors.customTerms?.[key]?.plural?.message;
  }

  const checkCustomTerms = (): boolean => {
    if (getValues("centerType") !== CUSTOM_CENTER_TYPE) return true;
    const terms = getValues("customTerms");
    let ok = true;
    for (const key of VOCABULARY_KEYS) {
      for (const form of ["singular", "plural"] as const) {
        if (!terms[key][form].trim()) {
          setError(`customTerms.${key}.${form}`, { message: P.validation.termRequired });
          ok = false;
        }
      }
    }
    if (ok) clearErrors("customTerms");
    return ok;
  };

  const goTo = (target: number) => {
    setStepChanged(true);
    setStep(target);
    setServerError(null);
  };

  const next = async () => {
    // Les termes du vocabulaire personnalisé sont vérifiés à part : l'erreur
    // d'un champ imbriqué d'un Controller n'est pas remontée par trigger().
    if (step === 1 && !checkCustomTerms()) return;
    const valid = await trigger([...NEW_CENTER_STEP_FIELDS[step]]);
    if (valid) goTo(Math.min(step + 1, STEP_COUNT - 1));
  };

  const submit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await createCenter(values);
      if (!result.ok) {
        setServerError(result.error);
        for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
          const known = NEW_CENTER_STEP_FIELDS.findIndex((fields) => (fields as readonly string[]).includes(field));
          if (known >= 0) {
            setError(field as keyof NewCenterInput, { message });
            goTo(known);
          }
        }
        return;
      }
      toast.success(L.success, { description: L.successDescription(values.adminEmail) });
      router.push(`${ROUTES.platform.centers}/${result.data.centerId}`);
    });
  });

  const isLast = step === STEP_COUNT - 1;
  const typeLabel = types.find((type) => type.code === centerType)?.label ?? "";
  const priceValue = Number(price.replace(",", "."));

  return (
    <form
      noValidate
      onSubmit={(event) => {
        if (!isLast) {
          event.preventDefault();
          void next();
          return;
        }
        void submit(event);
      }}
      className="flex flex-col gap-6"
    >
      <Stepper current={step} />

      <Card>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <p className="text-caption text-muted-foreground">{L.progress(step + 1, STEP_COUNT)}</p>
            <h2 ref={headingRef} tabIndex={-1} className="text-section outline-none">
              {L.steps[step]}
            </h2>
          </div>

          {step === 0 ? (
            <div className="flex flex-col gap-4">
              <FormField id="name" label={L.name} error={errors.name?.message}>
                <Input
                  autoComplete="off"
                  placeholder={L.namePlaceholder}
                  {...register("name", {
                    onChange: (event: { target: { value: string } }) => {
                      if (!slugEdited) setValue("slug", slugify(event.target.value));
                    },
                  })}
                />
              </FormField>
              <FormField id="slug" label={L.slug} hint={L.slugHint} error={errors.slug?.message}>
                <Input
                  autoComplete="off"
                  autoCapitalize="none"
                  {...register("slug", { onChange: () => setSlugEdited(true) })}
                />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="ownerName" label={`${L.ownerName} (${L.optional})`} error={errors.ownerName?.message}>
                  <Input autoComplete="off" {...register("ownerName")} />
                </FormField>
                <FormField id="ownerPhone" label={`${L.ownerPhone} (${L.optional})`} error={errors.ownerPhone?.message}>
                  <Input type="tel" inputMode="tel" autoComplete="off" {...register("ownerPhone")} />
                </FormField>
              </div>
              <FormField id="ownerEmail" label={`${L.ownerEmail} (${L.optional})`} error={errors.ownerEmail?.message}>
                <Input type="email" inputMode="email" autoCapitalize="none" autoComplete="off" {...register("ownerEmail")} />
              </FormField>
              <FormField id="notes" label={`${L.notes} (${L.optional})`} hint={L.notesHint} error={errors.notes?.message}>
                <Textarea rows={3} {...register("notes")} />
              </FormField>
            </div>
          ) : null}

          {step === 1 ? (
            <Controller
              control={control}
              name="customTerms"
              render={({ field }) => (
                <VocabularyPicker
                  types={types}
                  centerType={centerType}
                  customTerms={field.value}
                  onTypeChange={(code) => setValue("centerType", code, { shouldValidate: true })}
                  onTermsChange={field.onChange}
                  errors={flatErrors}
                  idPrefix="nouveau"
                />
              )}
            />
          ) : null}

          {step === 2 ? (
            <div className="flex flex-col gap-6">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 font-medium">{L.plan}</legend>
                <Controller
                  control={control}
                  name="plan"
                  render={({ field }) => (
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="sm:grid-cols-2">
                      {(["standard", "white_label"] as const).map((value) => (
                        <ChoiceItem key={value} className="items-start">
                          <RadioGroupItem value={value} className="mt-0.5" />
                          <span className="flex flex-col">
                            <span className="font-medium">{P.plan[value]}</span>
                            <span className="text-caption text-muted-foreground">{L.planHint[value]}</span>
                          </span>
                        </ChoiceItem>
                      ))}
                    </RadioGroup>
                  )}
                />
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="price" label={L.price} error={errors.price?.message}>
                  <Input inputMode="decimal" autoComplete="off" placeholder="490" {...register("price")} />
                </FormField>
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-body font-medium">{L.interval}</legend>
                  <Controller
                    control={control}
                    name="billingInterval"
                    render={({ field }) => (
                      <RadioGroup value={field.value} onValueChange={field.onChange} className="grid-cols-2">
                        {(["month", "year"] as const).map((value) => (
                          <ChoiceItem key={value}>
                            <RadioGroupItem value={value} />
                            {L.intervalOptions[value]}
                          </ChoiceItem>
                        ))}
                      </RadioGroup>
                    )}
                  />
                </fieldset>
              </div>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 font-medium">{L.status}</legend>
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="sm:grid-cols-2">
                      {(["active", "trial"] as const).map((value) => (
                        <ChoiceItem key={value}>
                          <RadioGroupItem value={value} />
                          {L.statusOptions[value]}
                        </ChoiceItem>
                      ))}
                    </RadioGroup>
                  )}
                />
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-3">
                <FormField id="activationDate" label={L.activationDate} error={errors.activationDate?.message}>
                  <Input type="date" className="numeric font-normal" {...register("activationDate")} />
                </FormField>
                <FormField id="firstDueDate" label={L.firstDueDate} error={errors.firstDueDate?.message}>
                  <Input
                    type="date"
                    className="numeric font-normal"
                    {...register("firstDueDate", { onChange: () => setDueEdited(true) })}
                  />
                </FormField>
                <FormField id="graceDays" label={L.graceDays} error={errors.graceDays?.message}>
                  <Input inputMode="numeric" autoComplete="off" {...register("graceDays")} />
                </FormField>
              </div>
              <p className="-mt-2 text-caption text-muted-foreground">
                {L.firstDueHint} {L.graceHint}
              </p>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-4">
                <FormField id="adminName" label={L.adminName} error={errors.adminName?.message}>
                  <Input autoComplete="off" {...register("adminName")} />
                </FormField>
                <FormField id="adminEmail" label={L.adminEmail} hint={L.adminEmailHint} error={errors.adminEmail?.message}>
                  <Input type="email" inputMode="email" autoCapitalize="none" autoComplete="off" {...register("adminEmail")} />
                </FormField>
                <FormField id="adminPhone" label={`${L.adminPhone} (${L.optional})`} error={errors.adminPhone?.message}>
                  <Input type="tel" inputMode="tel" autoComplete="off" {...register("adminPhone")} />
                </FormField>
              </div>

              <section aria-labelledby="recap" className="flex flex-col gap-3 rounded-lg bg-muted/60 p-4">
                <h3 id="recap" className="font-semibold text-heading">
                  {L.summary}
                </h3>
                <dl className="grid gap-x-6 gap-y-2 text-caption sm:grid-cols-2">
                  <SummaryItem label={L.name}>{name}</SummaryItem>
                  <SummaryItem label={L.slug}>{slug}</SummaryItem>
                  <SummaryItem label={L.typeLegend}>{typeLabel}</SummaryItem>
                  <SummaryItem label={L.plan}>{P.plan[plan]}</SummaryItem>
                  <SummaryItem label={L.price}>
                    {Number.isFinite(priceValue) ? `${formatMAD(priceValue)} ${P.interval[billingInterval]}` : "—"}
                  </SummaryItem>
                  <SummaryItem label={L.status}>{L.statusOptions[status]}</SummaryItem>
                  <SummaryItem label={L.activationDate}>{formatDate(activationDate)}</SummaryItem>
                  <SummaryItem label={L.firstDueDate}>{formatDate(firstDueDate)}</SummaryItem>
                </dl>
              </section>
            </div>
          ) : null}

          {serverError ? (
            <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-danger-ink">
              {serverError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" onClick={() => goTo(step - 1)} disabled={step === 0 || pending}>
          <ArrowLeft aria-hidden />
          {L.previous}
        </Button>
        {isLast ? (
          <Button type="submit" disabled={pending}>
            {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Building2 aria-hidden />}
            {pending ? L.submitting : L.submit}
          </Button>
        ) : (
          <Button type="submit">
            {L.next}
            <ArrowRight aria-hidden />
          </Button>
        )}
      </div>
    </form>
  );
}

function SummaryItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium text-heading">{children}</dd>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label={L.progress(current + 1, STEP_COUNT)}>
      {L.steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-2" aria-current={active ? "step" : undefined}>
            <span
              className={cn(
                "numeric flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-caption",
                done && "border-primary-soft bg-primary-soft text-primary",
                active && "border-primary bg-primary text-primary-foreground",
                !done && !active && "border-border bg-card text-muted-foreground",
              )}
            >
              {done ? <Check className="size-4" aria-hidden /> : index + 1}
            </span>
            <span className={cn("hidden text-caption lg:inline", active ? "font-semibold" : "text-muted-foreground")}>
              {label}
            </span>
            {index < STEP_COUNT - 1 ? (
              <span className={cn("h-0.5 flex-1 rounded-full transition-colors duration-300", done ? "bg-primary" : "bg-border")} aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
