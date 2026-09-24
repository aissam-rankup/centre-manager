"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheckBig, Copy, Eye, EyeOff, KeyRound, LoaderCircle, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { ChoiceItem } from "@/components/shared/choice-item";
import { FormField } from "@/components/shared/form-field";
import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { createTeacher } from "@/lib/actions/assistant";
import { LABELS } from "@/lib/constants/labels";
import type { LevelWithSubjects } from "@/lib/data/assistant";
import { type NewTeacherInput, newTeacherSchema } from "@/lib/validation/assistant";

const L = LABELS.assistant.newTeacher;

const EMPTY: NewTeacherInput = { fullName: "", phone: "", email: "", password: "", subjectIds: [] };

/** Mot de passe provisoire lisible : sans caractères ambigus (0/O, 1/l/I). */
function generatePassword(length = 12): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const values = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

type Created = { email: string; password: string };

export function NewTeacherForm({ levels }: { levels: LevelWithSubjects[] }) {
  const [created, setCreated] = useState<Created | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<NewTeacherInput>({
    resolver: zodResolver(newTeacherSchema),
    defaultValues: EMPTY,
    mode: "onTouched",
  });
  const { register, control, formState, setValue, setError, getValues } = form;
  const errors = formState.errors;

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await createTeacher(values);
      if (!result.ok) {
        setServerError(result.error);
        for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
          if (field in EMPTY) setError(field as keyof NewTeacherInput, { message });
        }
        return;
      }
      setCreated({ email: result.data.email, password: values.password });
    });
  });

  if (created) {
    return (
      <CreatedCard
        created={created}
        onAnother={() => {
          form.reset(EMPTY);
          setCreated(null);
          setShowPassword(false);
        }}
      />
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <SectionCard title={L.sections.account}>
        <div className="flex flex-col gap-4">
          <FormField id="fullName" label={L.fields.fullName} error={errors.fullName?.message}>
            <Input autoComplete="off" placeholder={L.fields.fullNamePlaceholder} {...register("fullName")} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="phone" label={L.fields.phone} error={errors.phone?.message}>
              <Input type="tel" inputMode="tel" autoComplete="off" placeholder={L.fields.phonePlaceholder} {...register("phone")} />
            </FormField>
            <FormField id="email" label={L.fields.email} error={errors.email?.message}>
              <Input
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoComplete="off"
                placeholder={L.fields.emailPlaceholder}
                {...register("email")}
              />
            </FormField>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-end gap-2">
              <FormField id="password" label={L.fields.password} className="flex-1">
                <Input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  className="numeric font-normal"
                  {...register("password")}
                />
              </FormField>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? L.fields.hidePassword : L.fields.showPassword}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setValue("password", generatePassword(), { shouldValidate: true });
                  setShowPassword(true);
                }}
              >
                <KeyRound aria-hidden />
                {L.fields.generate}
              </Button>
            </div>
            <p className={errors.password ? "text-caption text-danger-ink" : "text-caption text-muted-foreground"}>
              {errors.password?.message ?? L.fields.passwordHint}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title={L.sections.assignments} description={L.fields.assignmentsHint}>
        <Controller
          control={control}
          name="subjectIds"
          render={({ field }) => (
            <div className="flex flex-col gap-5">
              {levels.map((level) => (
                <fieldset key={level.id} className="flex flex-col gap-2">
                  <legend className="mb-2 text-caption font-medium text-muted-foreground uppercase">{level.name}</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {level.subjects.map((subject) => (
                      <ChoiceItem key={subject.id}>
                        <Checkbox
                          checked={field.value.includes(subject.id)}
                          onCheckedChange={(value) => {
                            const current = getValues("subjectIds");
                            field.onChange(
                              value === true
                                ? [...new Set([...current, subject.id])]
                                : current.filter((id) => id !== subject.id),
                            );
                          }}
                        />
                        {subject.name}
                      </ChoiceItem>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          )}
        />
        {errors.subjectIds ? <p className="text-caption text-danger-ink">{errors.subjectIds.message}</p> : null}
      </SectionCard>

      {serverError ? (
        <p role="alert" className="rounded-[10px] bg-danger/10 px-4 py-3 text-danger-ink">
          {serverError}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="self-stretch sm:self-end">
        {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <UserPlus aria-hidden />}
        {pending ? L.submitting : L.submit}
      </Button>
    </form>
  );
}

function CreatedCard({ created, onAnother }: { created: Created; onAnother: () => void }) {
  const S = L.success;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(S.credentials(created.email, created.password));
      toast.success(S.copied);
    } catch {
      toast.error(LABELS.actions.errors.unexpected);
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-6">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-success/10 text-success-ink">
            <CircleCheckBig className="size-6" aria-hidden />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-section" role="status">
              {S.title}
            </h2>
            <p className="text-muted-foreground">{S.description}</p>
          </div>
        </div>
        <dl className="grid gap-3 rounded-[10px] bg-muted px-4 py-3 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col">
            <dt className="text-caption text-muted-foreground">{S.email}</dt>
            <dd className="truncate font-medium">{created.email}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-caption text-muted-foreground">{S.password}</dt>
            <dd className="numeric">{created.password}</dd>
          </div>
        </dl>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="button" onClick={() => void copy()}>
            <Copy aria-hidden />
            {S.copy}
          </Button>
          <Button type="button" variant="outline" onClick={onAnother}>
            <UserPlus aria-hidden />
            {S.another}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
