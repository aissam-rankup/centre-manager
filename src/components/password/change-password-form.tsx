"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Save, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { PasswordInput } from "@/components/password/password-input";
import { PasswordStrength } from "@/components/password/password-strength";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { changeMyPassword, setForcedPassword } from "@/lib/actions/passwords";
import { useLabels } from "@/lib/i18n/client";
import { forcedPasswordFormSchema, type MyPasswordInput, myPasswordSchema } from "@/lib/validation/password";

type Values = MyPasswordInput;

/**
 * Nouveau mot de passe personnel : « Mon mot de passe » (l'actuel est
 * demandé) ou changement obligatoire après un mot de passe temporaire.
 */
export function ChangePasswordForm({ mode }: { mode: "mine" | "forced" }) {
  const P = useLabels().passwords;
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<Values>({
    resolver: zodResolver(mode === "mine" ? myPasswordSchema : forcedPasswordFormSchema),
    defaultValues: { current: "", next: "", confirm: "" },
  });
  const { register, handleSubmit, setError, reset, formState } = form;
  const errors = formState.errors;
  const next = useWatch({ control: form.control, name: "next" });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      if (mode === "mine") {
        const result = await changeMyPassword(values);
        if (!result.ok) {
          for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
            if (field === "current" || field === "next" || field === "confirm") setError(field, { message });
          }
          if (!result.fieldErrors) setServerError(result.error);
          return;
        }
        toast.success(P.mine.saved);
        reset();
        return;
      }
      const result = await setForcedPassword({ next: values.next, confirm: values.confirm });
      if (!result.ok) {
        for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
          if (field === "next" || field === "confirm") setError(field, { message });
        }
        if (!result.fieldErrors) setServerError(result.error);
        return;
      }
      // Navigation complète : le nouveau jeton (sans changement obligatoire) est lu par le proxy.
      window.location.assign(result.data.location);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {serverError ? (
        <div role="alert" className="flex items-start gap-3 rounded-lg bg-danger/10 px-4 py-3 text-danger-ink">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>{serverError}</p>
        </div>
      ) : null}
      {mode === "mine" ? (
        <FormField id="current-password" label={P.mine.current} error={errors.current?.message}>
          <PasswordInput autoComplete="current-password" {...register("current")} />
        </FormField>
      ) : null}
      <FormField id="new-password" label={P.mine.next} hint={P.validation.tooShort} error={errors.next?.message}>
        <PasswordInput autoComplete="new-password" {...register("next")} />
      </FormField>
      <PasswordStrength password={next} />
      <FormField id="confirm-password" label={P.mine.confirm} error={errors.confirm?.message}>
        <PasswordInput autoComplete="new-password" {...register("confirm")} />
      </FormField>
      <Button type="submit" className="mt-2 w-full" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Save aria-hidden />}
        {pending ? P.mine.submitting : mode === "forced" ? P.forced.submit : P.mine.submit}
      </Button>
    </form>
  );
}
