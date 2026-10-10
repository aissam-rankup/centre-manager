"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updatePlatformSettings } from "@/lib/actions/platform";
import { useLabels, useMessage } from "@/lib/i18n/client";
import { type PlatformSettingsInput, platformSettingsSchema } from "@/lib/validation/platform";

export function SettingsForm({ defaults }: { defaults: PlatformSettingsInput }) {
  const LABELS = useLabels();
  const L = LABELS.platform.settings;
  const message = useMessage();
  const [pending, startTransition] = useTransition();
  const form = useForm<PlatformSettingsInput>({ resolver: zodResolver(platformSettingsSchema), defaultValues: defaults });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await updatePlatformSettings(values);
      if (result.ok) toast.success(L.saved);
      else toast.error(message(result.error));
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormField id="support-name" label={L.name} error={errors.name?.message}>
        <Input autoComplete="off" placeholder={L.namePlaceholder} {...form.register("name")} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="support-phone" label={L.phone} error={errors.phone?.message}>
          <Input type="tel" inputMode="tel" autoComplete="off" {...form.register("phone")} />
        </FormField>
        <FormField id="support-email" label={L.email} error={errors.email?.message}>
          <Input type="email" inputMode="email" autoCapitalize="none" autoComplete="off" {...form.register("email")} />
        </FormField>
      </div>
      <Button type="submit" className="w-fit" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
        {pending ? LABELS.platform.actions.saving : LABELS.platform.actions.save}
      </Button>
    </form>
  );
}
