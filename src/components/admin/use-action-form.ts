"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { type DefaultValues, type FieldValues, type Path, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import type { ActionResult } from "@/lib/actions/result";

type Options<Input extends FieldValues, Output extends FieldValues> = {
  schema: z.ZodType<Output, Input>;
  defaultValues: DefaultValues<Input>;
  action: (values: Output) => Promise<ActionResult<unknown>>;
  successMessage: string;
  onSuccess?: () => void;
};

/**
 * Formulaire de dialogue relié à une Server Action : validation Zod, état d'envoi,
 * erreurs serveur générales et par champ, notification de succès.
 */
export function useActionForm<Input extends FieldValues, Output extends FieldValues>({
  schema,
  defaultValues,
  action,
  successMessage,
  onSuccess,
}: Options<Input, Output>) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const onOpenChange = (value: boolean) => {
    setOpen(value);
    if (value) {
      form.reset(defaultValues);
      setError(null);
    }
  };

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await action(values);
      if (!result.ok) {
        setError(result.error);
        for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
          form.setError(field as Path<Input>, { message });
        }
        return;
      }
      toast.success(successMessage);
      setOpen(false);
      onSuccess?.();
    });
  });

  return { form, open, onOpenChange, onSubmit, pending, error };
}
