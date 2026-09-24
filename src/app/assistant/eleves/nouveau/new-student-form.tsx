"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, Pencil, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { type CapturedPhoto, PhotoCapture } from "@/components/assistant/photo-capture";
import { ChoiceItem } from "@/components/shared/choice-item";
import { FormField } from "@/components/shared/form-field";
import { Money } from "@/components/shared/money";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { createStudent } from "@/lib/actions/assistant";
import { ROUTES } from "@/lib/auth/routes";
import { LABELS } from "@/lib/constants/labels";
import type { LevelWithSubjects } from "@/lib/data/assistant";
import { formatDate } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { NEW_STUDENT_STEP_FIELDS, type NewStudentInput, newStudentSchema } from "@/lib/validation/assistant";

const L = LABELS.assistant.newStudent;
const STEP_COUNT = L.steps.length;

type NewStudentFormProps = {
  levels: LevelWithSubjects[];
  /** Date du jour à Casablanca (AAAA-MM-JJ), fournie par le serveur. */
  todayIso: string;
};

export function NewStudentForm({ levels, todayIso }: NewStudentFormProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stepChanged = useRef(false);

  // Focus sur le titre de l'étape après chaque changement : repère pour les lecteurs d'écran et le clavier.
  useEffect(() => {
    if (stepChanged.current) headingRef.current?.focus();
  }, [step]);

  const form = useForm<NewStudentInput>({
    resolver: zodResolver(newStudentSchema),
    defaultValues: { fullName: "", guardianName: "", guardianPhone: "", notes: "", levelId: "", subjectIds: [] },
    mode: "onTouched",
  });
  const { register, control, formState, setValue, trigger, getValues } = form;
  const errors = formState.errors;

  const [fullName, levelId, subjectIds, guardianName, guardianPhone] = useWatch({
    control,
    name: ["fullName", "levelId", "subjectIds", "guardianName", "guardianPhone"],
  });

  const level = levels.find((item) => item.id === levelId) ?? null;
  const selectedSubjects = useMemo(
    () => (level ? level.subjects.filter((subject) => subjectIds.includes(subject.id)) : []),
    [level, subjectIds],
  );
  const monthlyTotal = selectedSubjects.reduce((sum, subject) => sum + subject.monthlyPrice, 0);

  // Première facture : due 5 jours après l'inscription ; cycle selon le jour d'inscription.
  const firstDueIso = useMemo(() => {
    const [year, month, day] = todayIso.split("-").map(Number);
    const due = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + 5));
    return due.toISOString().slice(0, 10);
  }, [todayIso]);
  const billingDay = Number(todayIso.slice(8, 10)) < 15 ? 1 : 15;

  const goTo = (target: number) => {
    stepChanged.current = true;
    setStep(target);
    setServerError(null);
  };

  const next = async () => {
    const valid = await trigger([...NEW_STUDENT_STEP_FIELDS[step]]);
    if (valid) goTo(Math.min(step + 1, STEP_COUNT - 1));
  };

  const submit = form.handleSubmit((values) => {
    setServerError(null);
    const data = new FormData();
    data.set("data", JSON.stringify(values));
    if (photo) data.set("photo", new File([photo.blob], "photo.jpg", { type: "image/jpeg" }));

    startTransition(async () => {
      const result = await createStudent(data);
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      toast.success(L.success, { description: L.successDescription });
      router.push(`${ROUTES.assistant.students}/${result.data.studentId}`);
    });
  });

  const isLast = step === STEP_COUNT - 1;

  return (
    <form
      noValidate
      onSubmit={(event) => {
        // « Entrée » passe à l'étape suivante ; seule la dernière étape envoie le formulaire.
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
            <div className="flex flex-col gap-6">
              <PhotoCapture name={fullName} value={photo} onChange={setPhoto} />
              <FormField id="fullName" label={L.fields.fullName} error={errors.fullName?.message}>
                <Input autoComplete="off" placeholder={L.fields.fullNamePlaceholder} {...register("fullName")} />
              </FormField>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="flex flex-col gap-4">
              <FormField id="guardianName" label={L.fields.guardianName} error={errors.guardianName?.message}>
                <Input autoComplete="off" placeholder={L.fields.guardianNamePlaceholder} {...register("guardianName")} />
              </FormField>
              <FormField id="guardianPhone" label={L.fields.guardianPhone} error={errors.guardianPhone?.message}>
                <Input
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  placeholder={L.fields.guardianPhonePlaceholder}
                  {...register("guardianPhone")}
                />
              </FormField>
              <FormField id="notes" label={L.fields.notes} error={errors.notes?.message}>
                <Textarea rows={3} placeholder={L.fields.notesPlaceholder} {...register("notes")} />
              </FormField>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="flex flex-col gap-6">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 font-medium">{L.fields.level}</legend>
                <Controller
                  control={control}
                  name="levelId"
                  render={({ field }) => (
                    <RadioGroup
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        // Les matières dépendent du niveau.
                        setValue("subjectIds", [], { shouldValidate: false });
                      }}
                      aria-invalid={errors.levelId ? true : undefined}
                    >
                      {levels.map((item) => (
                        <ChoiceItem key={item.id}>
                          <RadioGroupItem value={item.id} />
                          {item.name}
                        </ChoiceItem>
                      ))}
                    </RadioGroup>
                  )}
                />
                {errors.levelId ? <p className="text-caption text-danger-ink">{errors.levelId.message}</p> : null}
              </fieldset>

              {level ? (
                <fieldset className="flex flex-col gap-2">
                  <legend className="font-medium">{L.fields.subjects}</legend>
                  <p className="mb-2 text-caption text-muted-foreground">{L.fields.subjectsHint}</p>
                  {level.subjects.length === 0 ? (
                    <p className="text-muted-foreground">{L.fields.noSubjects}</p>
                  ) : (
                    <Controller
                      control={control}
                      name="subjectIds"
                      render={({ field }) => (
                        <div className="flex flex-col gap-2">
                          {level.subjects.map((subject) => {
                            const checked = field.value.includes(subject.id);
                            return (
                              <ChoiceItem key={subject.id}>
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(value) => {
                                    // Valeur lue au moment du clic : fiable même pour des clics rapprochés.
                                    const current = getValues("subjectIds");
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
                            );
                          })}
                        </div>
                      )}
                    />
                  )}
                  {errors.subjectIds ? <p className="text-caption text-danger-ink">{errors.subjectIds.message}</p> : null}
                </fieldset>
              ) : null}

              <div className="flex items-center justify-between rounded-[10px] bg-muted px-4 py-3" aria-live="polite">
                <span className="font-medium">{L.fields.total}</span>
                <Money amount={monthlyTotal} className="text-xl" />
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <dl className="flex flex-col divide-y">
              <SummaryRow label={L.summary.identity} onEdit={() => goTo(0)}>
                <span className="flex items-center gap-3">
                  <StudentAvatar name={fullName} photoUrl={photo?.previewUrl ?? null} />
                  <span className="font-medium">{fullName}</span>
                </span>
              </SummaryRow>
              <SummaryRow label={L.summary.guardian} onEdit={() => goTo(1)}>
                {guardianName || guardianPhone ? (
                  <span className="flex flex-col">
                    {guardianName ? <span>{guardianName}</span> : null}
                    {guardianPhone ? <span className="numeric font-normal">{formatPhone(guardianPhone)}</span> : null}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{LABELS.assistant.student.noGuardian}</span>
                )}
              </SummaryRow>
              <SummaryRow label={L.summary.subjects} onEdit={() => goTo(2)}>
                <span className="flex flex-col gap-1">
                  <span className="text-muted-foreground">{level?.name}</span>
                  {selectedSubjects.map((subject) => (
                    <span key={subject.id} className="flex justify-between gap-4">
                      <span>{subject.name}</span>
                      <Money amount={subject.monthlyPrice} />
                    </span>
                  ))}
                  <span className="mt-1 flex justify-between gap-4 border-t pt-2 font-semibold">
                    <span>{L.fields.total}</span>
                    <Money amount={monthlyTotal} />
                  </span>
                </span>
              </SummaryRow>
              <div className="pt-4">
                <p className="rounded-[10px] bg-brand/10 px-4 py-3 text-brand-ink">
                  {L.summary.firstInvoice(formatDate(firstDueIso), LABELS.billing.cycle[billingDay] ?? "")}
                </p>
              </div>
            </dl>
          ) : null}

          {serverError ? (
            <p role="alert" className="rounded-[10px] bg-danger/10 px-4 py-3 text-danger-ink">
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
            {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <UserPlus aria-hidden />}
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
                done && "border-success bg-success text-white",
                active && "border-brand text-brand-ink",
                !done && !active && "border-border text-muted-foreground",
              )}
            >
              {done ? <Check className="size-4" aria-hidden /> : index + 1}
            </span>
            <span className={cn("hidden text-caption lg:inline", active ? "font-semibold" : "text-muted-foreground")}>
              {label}
            </span>
            {index < STEP_COUNT - 1 ? (
              <span className={cn("h-0.5 flex-1 rounded-full", done ? "bg-success" : "bg-border")} aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function SummaryRow({ label, onEdit, children }: { label: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-4 first:pt-0">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <dt className="text-caption text-muted-foreground">{label}</dt>
        <dd>{children}</dd>
      </div>
      <Button type="button" variant="ghost" size="icon" onClick={onEdit} aria-label={`${L.summary.edit} — ${label}`}>
        <Pencil aria-hidden />
      </Button>
    </div>
  );
}
