"use client";

import { MessageCircle } from "lucide-react";
import { type FormEvent, useId, useState } from "react";

import { localeProps } from "@/components/vitrine/fonts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Locale } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";
import { type DemoRequest, demoWhatsAppUrl, VITRINE } from "@/lib/vitrine/content";

type DemoButtonProps = {
  locale: Locale;
  /** Libellé du bouton (par défaut : celui de l'en-tête). */
  label?: string;
  variant?: "default" | "outline" | "secondary";
  className?: string;
};

const EMPTY: DemoRequest = { name: "", center: "", city: "", phone: "" };

/**
 * Demande de démo : petit formulaire, puis WhatsApp s'ouvre avec le message
 * prérempli (le visiteur le relit et l'envoie). Rien n'est enregistré.
 */
export function DemoButton({ locale, label, variant = "default", className }: DemoButtonProps) {
  const t = VITRINE[locale].demo;
  const id = useId();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<DemoRequest>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof DemoRequest, string>>>({});

  const update = (field: keyof DemoRequest, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const request: DemoRequest = {
      name: values.name.trim(),
      center: values.center.trim(),
      city: values.city.trim(),
      phone: values.phone.trim(),
    };
    const missing: Partial<Record<keyof DemoRequest, string>> = {};
    if (!request.name) missing.name = t.required;
    if (!request.center) missing.center = t.required;
    if (missing.name || missing.center) {
      setErrors(missing);
      return;
    }
    const url = demoWhatsAppUrl(t.message(request));
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) window.location.href = url;
    setOpen(false);
    setValues(EMPTY);
  };

  const field = (name: keyof DemoRequest, text: string, optional: boolean, input: Partial<React.ComponentProps<"input">>) => {
    const inputId = `${id}-${name}`;
    const errorId = `${inputId}-erreur`;
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={inputId}>
          {text}
          {optional ? <span className="font-normal text-muted-foreground"> ({t.optional})</span> : null}
        </Label>
        <Input
          id={inputId}
          value={values[name]}
          onChange={(event) => update(name, event.target.value)}
          aria-invalid={errors[name] ? true : undefined}
          aria-describedby={errors[name] ? errorId : undefined}
          {...input}
        />
        {errors[name] ? (
          <p id={errorId} className="text-caption text-danger-ink">
            {errors[name]}
          </p>
        ) : null}
      </div>
    );
  };

  const props = localeProps(locale);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} className={cn("gap-2", className)}>
          <MessageCircle aria-hidden />
          {label ?? VITRINE[locale].nav.demo}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} lang={props.lang} dir={props.dir} className={cn("sm:max-w-md", props.className)} style={props.style}>
        <DialogHeader className="text-start">
          <DialogTitle className="text-section text-heading">{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          {field("name", t.name, false, { autoComplete: "name" })}
          {field("center", t.center, false, { autoComplete: "organization" })}
          {field("city", t.city, true, { autoComplete: "address-level2" })}
          {field("phone", t.phone, true, { type: "tel", inputMode: "tel", autoComplete: "tel", dir: "ltr" })}
          <p className="text-caption text-muted-foreground">{t.note}</p>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button type="submit" className="gap-2">
              <MessageCircle aria-hidden />
              {t.submit}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t.cancel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
