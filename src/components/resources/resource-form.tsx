"use client";

import { FileUp, LoaderCircle, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ChoiceItem } from "@/components/shared/choice-item";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { createResource, updateResource } from "@/lib/actions/resources";
import { ROUTES } from "@/lib/auth/routes";
import type { TeachingOption } from "@/lib/data/resources";
import { useLabels, useMessage } from "@/lib/i18n/client";
import {
  RESOURCE_MAX_BYTES,
  RESOURCE_MIME_TYPES,
  RESOURCE_TYPES,
  RESOURCE_TYPES_WITH_DUE_DATE,
  type ResourceType,
} from "@/lib/resources";

export type ResourceFormDefaults = {
  id?: string;
  type: ResourceType;
  subject: string;
  title: string;
  description: string;
  dueDate: string;
  publish: boolean;
  /** Fichier déjà rattaché (modification). */
  currentFileName: string | null;
};

/** Publication ou modification d'une ressource : type, matière et niveau, titre, description, fichier, échéance. */
export function ResourceForm({ options, defaults }: { options: TeachingOption[]; defaults: ResourceFormDefaults }) {
  const LABELS = useLabels();
  const message = useMessage();
  const L = LABELS.resources;
  const F = L.fields;
  const router = useRouter();
  const [values, setValues] = useState(defaults);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editing = Boolean(defaults.id);
  const set = <K extends keyof ResourceFormDefaults>(key: K, value: ResourceFormDefaults[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const onFile = (selected: File | null) => {
    setErrors((current) => ({ ...current, file: "" }));
    if (selected && selected.size > RESOURCE_MAX_BYTES) {
      setErrors((current) => ({ ...current, file: L.validation.fileTooLarge }));
      setFile(null);
      return;
    }
    setFile(selected);
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError(null);
    setErrors({});
    if (!editing && !file) {
      setErrors({ file: L.validation.fileRequired });
      return;
    }
    const data = new FormData();
    data.set(
      "data",
      JSON.stringify({
        ...(defaults.id ? { id: defaults.id } : {}),
        type: values.type,
        subject: values.subject,
        title: values.title,
        description: values.description,
        dueDate: RESOURCE_TYPES_WITH_DUE_DATE.includes(values.type) ? values.dueDate : "",
        publish: values.publish,
      }),
    );
    if (file) data.set("file", file);

    startTransition(async () => {
      const result = editing ? await updateResource(data) : await createResource(data);
      if (!result.ok) {
        setServerError(message(result.error));
        setErrors(result.fieldErrors ?? {});
        return;
      }
      toast.success(values.publish ? L.publishedToast : L.saved);
      router.push(ROUTES.teacher.resources);
    });
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-card md:p-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-medium">{F.type}</legend>
        <RadioGroup value={values.type} onValueChange={(value) => set("type", value as ResourceType)} className="grid-cols-2 sm:grid-cols-4">
          {RESOURCE_TYPES.map((type) => (
            <ChoiceItem key={type}>
              <RadioGroupItem value={type} />
              {L.types[type]}
            </ChoiceItem>
          ))}
        </RadioGroup>
      </fieldset>

      <FormField id="resource-subject" label={F.subject} error={errors.subject}>
        <NativeSelect value={values.subject} onChange={(event) => set("subject", event.target.value)}>
          <option value="">{F.subjectPlaceholder}</option>
          {options.map((option) => (
            <option key={`${option.subjectId}:${option.levelId}`} value={`${option.subjectId}:${option.levelId}`}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </FormField>

      <FormField id="resource-title" label={F.title} error={errors.title}>
        <Input value={values.title} maxLength={150} placeholder={F.titlePlaceholder} onChange={(event) => set("title", event.target.value)} />
      </FormField>

      <FormField id="resource-description" label={F.description} hint={F.descriptionHint} error={errors.description}>
        <Textarea rows={4} maxLength={2000} value={values.description} onChange={(event) => set("description", event.target.value)} />
      </FormField>

      <FormField
        id="resource-file"
        label={editing ? F.replaceFile : F.file}
        hint={editing && defaults.currentFileName ? `${F.currentFile(defaults.currentFileName)} · ${F.fileHint}` : F.fileHint}
        error={errors.file}
      >
        <Input type="file" accept={RESOURCE_MIME_TYPES.join(",")} onChange={(event) => onFile(event.target.files?.[0] ?? null)} />
      </FormField>

      {RESOURCE_TYPES_WITH_DUE_DATE.includes(values.type) ? (
        <FormField id="resource-due" label={F.dueDate} hint={F.dueDateHint} error={errors.dueDate}>
          <Input type="date" className="numeric w-48 font-normal" value={values.dueDate} onChange={(event) => set("dueDate", event.target.value)} />
        </FormField>
      ) : null}

      <ChoiceItem className="items-start">
        <Checkbox className="mt-0.5" checked={values.publish} onCheckedChange={(value) => set("publish", value === true)} />
        <span className="flex flex-col">
          <span className="font-medium">{F.publishNow}</span>
          <span className="text-caption text-muted-foreground">{F.publishNowHint}</span>
        </span>
      </ChoiceItem>

      {serverError ? (
        <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-danger-ink">
          {serverError}
        </p>
      ) : null}

      <Button type="submit" className="self-end" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : editing ? <Save aria-hidden /> : <FileUp aria-hidden />}
        {pending ? L.submitting : L.submit}
      </Button>
    </form>
  );
}
