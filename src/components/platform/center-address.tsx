"use client";

import { Check, Copy, ExternalLink, Globe, LoaderCircle, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { ChoiceItem } from "@/components/shared/choice-item";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { changeCenterSlug, checkSlugAvailability, type SlugAvailability } from "@/lib/actions/platform";
import { type AddressPattern, addressFor } from "@/lib/center-host";
import { LABELS } from "@/lib/constants/labels";
import { cn } from "@/lib/utils";

const L = LABELS.centerAddress;

const withoutProtocol = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

/** Adresse d'un centre avec « Copier » et « Ouvrir » (liste et fiche de la console). */
export function CenterAddressLinks({ url, compact = false }: { url: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(L.copied);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(L.copyFailed);
    }
  };

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-2", compact && "gap-1")}>
      <span className="flex min-w-0 items-center gap-1.5 font-medium break-all">
        <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        {withoutProtocol(url)}
      </span>
      <span className="flex gap-1">
        <Button type="button" variant="outline" onClick={() => void copy()}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {L.copy}
        </Button>
        <Button asChild variant="outline">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink aria-hidden />
            {L.open}
          </a>
        </Button>
      </span>
    </div>
  );
}

/** Disponibilité d'une adresse, vérifiée en direct (après une courte pause de saisie). */
export function useSlugAvailability(slug: string, centerId: string | null): SlugAvailability | "checking" | null {
  const [result, setResult] = useState<{ slug: string; status: SlugAvailability } | null>(null);
  const value = slug.trim().toLowerCase();

  useEffect(() => {
    if (!value) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void checkSlugAvailability(value, centerId).then((status) => {
        if (!cancelled) setResult({ slug: value, status });
      });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value, centerId]);

  if (!value) return null;
  return result?.slug === value ? result.status : "checking";
}

/** Aperçu de l'adresse complète et état de disponibilité. */
export function SlugPreview({
  pattern,
  slug,
  availability,
  id,
}: {
  pattern: AddressPattern;
  slug: string;
  availability: SlugAvailability | "checking" | null;
  id?: string;
}) {
  const value = slug.trim().toLowerCase();
  if (!value) return null;
  const ok = availability === "available" || availability === "current";
  return (
    <div id={id} className="flex flex-col gap-1 rounded-lg bg-muted/60 px-3 py-2 text-caption" aria-live="polite">
      <span className="text-muted-foreground">
        {L.preview} : <span className="font-medium break-all text-foreground">{withoutProtocol(addressFor(pattern, value))}</span>
      </span>
      {availability === "checking" ? (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          {L.checking}
        </span>
      ) : availability ? (
        <span className={cn("flex items-center gap-1.5", ok ? "text-success-ink" : "text-danger-ink")}>
          {ok ? <Check className="size-3.5" aria-hidden /> : <TriangleAlert className="size-3.5" aria-hidden />}
          {L.status[availability]}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Changement d'adresse (super-admin) : nouvelle adresse vérifiée en direct,
 * puis confirmation explicite. L'ancienne adresse continue de rediriger.
 */
export function ChangeSlugDialog({ centerId, slug, pattern }: { centerId: string; slug: string; pattern: AddressPattern }) {
  const router = useRouter();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(slug);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const availability = useSlugAvailability(value, centerId);
  const next = value.trim().toLowerCase();
  const canSubmit = availability === "available" && confirmed && !pending;

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await changeCenterSlug({ centerId, slug: next });
      if (!result.ok) {
        setError(result.fieldErrors?.slug ?? result.error);
        return;
      }
      toast.success(L.changed);
      setOpen(false);
      router.refresh();
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (isOpen) {
          setValue(slug);
          setConfirmed(false);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          {L.change}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{L.changeTitle}</DialogTitle>
          <DialogDescription>{L.changeDescription}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) submit();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={inputId}>{L.newSlug}</Label>
            <Input
              id={inputId}
              value={value}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-describedby={`${inputId}-apercu`}
              onChange={(event) => {
                setValue(event.target.value);
                setConfirmed(false);
              }}
            />
            <SlugPreview id={`${inputId}-apercu`} pattern={pattern} slug={value} availability={availability} />
          </div>
          {availability === "available" ? (
            <ChoiceItem>
              <Checkbox
                checked={confirmed}
                onCheckedChange={(checked) => setConfirmed(checked === true)}
                aria-labelledby={`${inputId}-confirmation`}
              />
              <span id={`${inputId}-confirmation`} className="text-body">
                {L.confirmLabel(withoutProtocol(addressFor(pattern, slug)), withoutProtocol(addressFor(pattern, next)))}
              </span>
            </ChoiceItem>
          ) : null}
          {error ? (
            <p role="alert" className="text-caption text-danger-ink">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {L.cancel}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
              {pending ? L.submitting : L.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
