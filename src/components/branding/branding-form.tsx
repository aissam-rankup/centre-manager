"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { BadgeCheck, CircleAlert, ImageUp, LoaderCircle, SearchCheck, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { type Path, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveBranding, uploadBrandingImage, verifyCustomDomain } from "@/lib/actions/branding";
import { LABELS } from "@/lib/constants/labels";
import { type BrandingFormInput, brandingFormSchema, type BrandingImageKind } from "@/lib/validation/branding";

const L = LABELS.branding;

type BrandingFormProps = {
  defaults: BrandingFormInput;
  /** Super-admin : domaine personnalisé et vérification. */
  superAdmin: boolean;
  domainVerified: boolean;
  /** Cible DNS des domaines personnalisés (affichée dans l'aide). */
  dnsTarget: string | null;
  onSaved?: () => void;
};

export function BrandingForm({ defaults, superAdmin, domainVerified, dnsTarget, onSaved }: BrandingFormProps) {
  const [pending, startTransition] = useTransition();
  const [verifying, startVerify] = useTransition();
  const [verified, setVerified] = useState(domainVerified);
  const form = useForm<BrandingFormInput>({ resolver: zodResolver(brandingFormSchema), defaultValues: defaults });
  const errors = form.formState.errors;
  const [primary, secondary, accent, brandName, logoUrl, customDomain] = useWatch({
    control: form.control,
    name: ["primaryColor", "secondaryColor", "accentColor", "brandName", "logoUrl", "customDomain"],
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await saveBranding(values);
      if (!result.ok) {
        toast.error(result.error);
        for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
          form.setError(field as Path<BrandingFormInput>, { message });
        }
        return;
      }
      if (values.customDomain !== defaults.customDomain) setVerified(false);
      toast.success(L.saved);
      onSaved?.();
    }),
  );

  const verify = () =>
    startVerify(async () => {
      const result = await verifyCustomDomain(defaults.centerId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setVerified(result.data.verified);
      if (result.data.verified) toast.success(L.verifiedOk);
      else toast.error(L.verifiedKo(dnsTarget ?? ""));
    });

  const swatch = primary && /^#[0-9a-f]{6}$/i.test(primary) ? primary : undefined;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h3 className="font-semibold text-heading">{L.identity}</h3>
        <FormField id="brand-name" label={L.brandName} hint={L.brandNameHint} error={errors.brandName?.message}>
          <Input autoComplete="off" {...form.register("brandName")} />
        </FormField>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="font-semibold text-heading">{L.images}</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <ImageField form={form} name="logoUrl" kind="logo" label={L.logo} hint={L.logoHint} centerId={defaults.centerId} />
          <ImageField form={form} name="faviconUrl" kind="favicon" label={L.favicon} hint={L.faviconHint} centerId={defaults.centerId} />
          <ImageField
            form={form}
            name="loginBackgroundUrl"
            kind="background"
            label={L.loginBackground}
            hint={L.loginBackgroundHint}
            centerId={defaults.centerId}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="font-semibold text-heading">{L.colors}</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <ColorField form={form} name="primaryColor" label={L.primary} hint={L.primaryHint} error={errors.primaryColor?.message} />
          <ColorField form={form} name="secondaryColor" label={L.secondary} hint={L.secondaryHint} error={errors.secondaryColor?.message} />
          <ColorField form={form} name="accentColor" label={L.accent} hint={L.accentHint} error={errors.accentColor?.message} />
        </div>
        {/* Aperçu : barre latérale et bouton aux couleurs choisies. */}
        <div className="flex items-center gap-4 rounded-xl border border-divider p-4" aria-label={L.preview}>
          <span
            className="flex h-14 w-10 shrink-0 items-center justify-center rounded-lg bg-sidebar"
            style={swatch ? { backgroundColor: swatch } : undefined}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- aperçu du logo (bucket public)
              <img src={logoUrl} alt="" className="size-8 rounded bg-white object-contain p-0.5" />
            ) : null}
          </span>
          <span className="min-w-0 flex-1 truncate font-semibold text-heading">{brandName || L.preview}</span>
          <span
            className="rounded-lg px-4 py-2 text-caption font-medium text-white"
            style={{ backgroundColor: swatch ?? "var(--primary)" }}
          >
            {L.previewButton}
          </span>
          {[secondary, accent].map((value, index) =>
            value && /^#[0-9a-f]{6}$/i.test(value) ? (
              <span key={index} className="size-6 rounded-full border border-divider" style={{ backgroundColor: value }} />
            ) : null,
          )}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="font-semibold text-heading">{L.emails}</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <FormField id="brand-sender" label={`${L.senderName} (${L.optional})`} error={errors.senderName?.message}>
            <Input autoComplete="off" {...form.register("senderName")} />
          </FormField>
          <FormField id="brand-support-email" label={`${L.supportEmail} (${L.optional})`} error={errors.supportEmail?.message}>
            <Input type="email" inputMode="email" autoCapitalize="none" autoComplete="off" {...form.register("supportEmail")} />
          </FormField>
          <FormField id="brand-support-phone" label={`${L.supportPhone} (${L.optional})`} error={errors.supportPhone?.message}>
            <Input type="tel" inputMode="tel" autoComplete="off" {...form.register("supportPhone")} />
          </FormField>
        </div>
      </section>

      {superAdmin ? (
        <section className="flex flex-col gap-4">
          <h3 className="font-semibold text-heading">{L.domain}</h3>
          <FormField
            id="brand-domain"
            label={`${L.domain} (${L.optional})`}
            hint={dnsTarget ? L.domainHint(dnsTarget) : L.noTarget}
            error={errors.customDomain?.message}
          >
            <Input autoComplete="off" autoCapitalize="none" placeholder="app.moncentre.ma" {...form.register("customDomain")} />
          </FormField>
          {defaults.customDomain && customDomain === defaults.customDomain ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className={verified ? "flex items-center gap-1.5 text-success-ink" : "flex items-center gap-1.5 text-warning-ink"}>
                {verified ? <BadgeCheck className="size-4" aria-hidden /> : <CircleAlert className="size-4" aria-hidden />}
                {verified ? L.domainVerified : L.domainPending}
              </span>
              <Button type="button" variant="outline" onClick={verify} disabled={verifying || !dnsTarget}>
                {verifying ? <LoaderCircle className="animate-spin" aria-hidden /> : <SearchCheck aria-hidden />}
                {verifying ? L.verifying : L.verify}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      <Button type="submit" className="w-fit" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
        {pending ? L.saving : L.save}
      </Button>
    </form>
  );
}

type FieldName = "primaryColor" | "secondaryColor" | "accentColor";

function ColorField({
  form,
  name,
  label,
  hint,
  error,
}: {
  form: ReturnType<typeof useForm<BrandingFormInput>>;
  name: FieldName;
  label: string;
  hint: string;
  error?: string;
}) {
  const value = useWatch({ control: form.control, name });
  const valid = /^#[0-9a-f]{6}$/i.test(value);
  return (
    <div className="flex items-start gap-2">
      <input
        type="color"
        aria-label={label}
        value={valid ? value : "#6c2bf5"}
        onChange={(event) => form.setValue(name, event.target.value, { shouldDirty: true, shouldValidate: true })}
        className="mt-7 h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-card p-1"
      />
      <FormField id={`brand-${name}`} label={`${label} (${L.optional})`} hint={hint} error={error} className="min-w-0 flex-1">
        <Input className="numeric font-normal" placeholder="#6c2bf5" autoComplete="off" {...form.register(name)} />
      </FormField>
    </div>
  );
}

function ImageField({
  form,
  name,
  kind,
  label,
  hint,
  centerId,
}: {
  form: ReturnType<typeof useForm<BrandingFormInput>>;
  name: "logoUrl" | "faviconUrl" | "loginBackgroundUrl";
  kind: BrandingImageKind;
  label: string;
  hint: string;
  centerId: string;
}) {
  const value = useWatch({ control: form.control, name });
  const input = useRef<HTMLInputElement>(null);
  const [uploading, startUpload] = useTransition();

  const upload = (file: File) =>
    startUpload(async () => {
      const data = new FormData();
      data.set("centerId", centerId);
      data.set("kind", kind);
      data.set("file", file);
      const result = await uploadBrandingImage(data);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      form.setValue(name, result.data.url, { shouldDirty: true });
    });

  return (
    <div className="flex flex-col gap-2">
      <span className="text-body font-medium">{label}</span>
      <div className="flex h-24 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/40">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- aperçu (bucket public)
          <img src={value} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <ImageUp className="size-6 text-subtle" aria-hidden />
        )}
      </div>
      <p className="text-caption text-muted-foreground">{hint}</p>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload(file);
          event.target.value = "";
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={uploading} aria-label={`${value ? L.replace : L.choose} — ${label}`}>
          {uploading ? <LoaderCircle className="animate-spin" aria-hidden /> : <ImageUp aria-hidden />}
          {uploading ? L.uploading : value ? L.replace : L.choose}
        </Button>
        {value ? (
          <Button type="button" variant="ghost" onClick={() => form.setValue(name, "", { shouldDirty: true })} aria-label={`${L.remove} — ${label}`}>
            <Trash2 aria-hidden />
            {L.remove}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
