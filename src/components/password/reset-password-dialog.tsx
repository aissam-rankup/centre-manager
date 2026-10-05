"use client";

import { Copy, KeyRound, LoaderCircle, MessageCircle, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactElement, useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { PasswordInput } from "@/components/password/password-input";
import { PasswordStrength } from "@/components/password/password-strength";
import { ChoiceItem } from "@/components/shared/choice-item";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { resetPassword, type ResetPasswordResult } from "@/lib/actions/passwords";
import { useLabels } from "@/lib/i18n/client";
import { toWhatsAppHref } from "@/lib/phone";
import { formatLoginCode } from "@/lib/student-codes";

export type ResetTarget = { userId: string } | { studentId: string };

/**
 * Réinitialisation d'un mot de passe par un responsable : mot de passe
 * temporaire généré ou saisi, affiché une seule fois (copie, WhatsApp avec
 * un message modifiable), puis oublié. La personne est déconnectée partout
 * et devra le remplacer à sa prochaine connexion.
 */
export function ResetPasswordDialog({ target, name, trigger }: { target: ResetTarget; name: string; trigger: ReactElement }) {
  const P = useLabels().passwords;
  const router = useRouter();
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"generate" | "manual">("generate");
  const [manual, setManual] = useState("");
  const [error, setError] = useState<{ message: string; field: boolean } | null>(null);
  const [result, setResult] = useState<ResetPasswordResult | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const clear = () => {
    // Le mot de passe temporaire n'est gardé nulle part après la fermeture.
    setResult(null);
    setManual("");
    setMessage("");
    setMode("generate");
    setError(null);
  };

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const response = await resetPassword({ ...target, mode, password: mode === "manual" ? manual : undefined });
      if (!response.ok) {
        setError({ message: response.fieldErrors?.password ?? response.error, field: Boolean(response.fieldErrors?.password) });
        return;
      }
      const data = response.data;
      setManual("");
      setResult(data);
      setMessage(
        data.student
          ? P.studentMessage(data.fullName || name, data.loginUrl, formatLoginCode(data.loginCode ?? ""), data.password)
          : P.staffMessage(data.fullName || name, data.loginUrl, data.password),
      );
    });

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(P.copied);
    } catch {
      // Copie indisponible : la valeur reste lisible à l'écran.
    }
  };

  const chat = result?.phone ? toWhatsAppHref(result.phone) : null;
  const whatsapp = chat ? `${chat}?text=${encodeURIComponent(message)}` : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) {
          if (result) router.refresh();
          clear();
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="size-5 text-primary" aria-hidden />
                {P.doneTitle}
              </DialogTitle>
              <DialogDescription>{P.doneDescription}</DialogDescription>
            </DialogHeader>
            <dl className="flex flex-col gap-3">
              {[
                { label: P.address, value: result.loginUrl, mono: false },
                ...(result.loginCode ? [{ label: P.loginCode, value: formatLoginCode(result.loginCode), mono: true }] : []),
                { label: P.password, value: result.password, mono: true },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2">
                  <div className="flex min-w-0 flex-col">
                    <dt className="text-caption text-muted-foreground">{row.label}</dt>
                    <dd className={row.mono ? "numeric text-section tracking-wider text-heading" : "text-caption break-all"}>{row.value}</dd>
                  </div>
                  <Button type="button" variant="ghost" size="icon" aria-label={`${P.copy} : ${row.label}`} onClick={() => void copy(row.value)}>
                    <Copy aria-hidden />
                  </Button>
                </div>
              ))}
            </dl>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${ids}-message`}>{P.message}</Label>
              <Textarea id={`${ids}-message`} rows={4} value={message} onChange={(event) => setMessage(event.target.value)} />
              {chat ? null : <p className="text-caption text-muted-foreground">{P.noPhone}</p>}
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              {whatsapp ? (
                <Button asChild variant="outline">
                  <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                    <MessageCircle aria-hidden />
                    {P.whatsapp}
                  </a>
                </Button>
              ) : (
                <span />
              )}
              <Button type="button" onClick={() => setOpen(false)}>
                {P.done}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <DialogHeader>
              <DialogTitle>{P.resetTitle(name)}</DialogTitle>
              <DialogDescription>{P.resetDescription}</DialogDescription>
            </DialogHeader>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-body font-medium">{P.modeLegend}</legend>
              <RadioGroup value={mode} onValueChange={(value) => setMode(value === "manual" ? "manual" : "generate")}>
                <ChoiceItem>
                  <RadioGroupItem value="generate" />
                  {P.modeGenerate}
                </ChoiceItem>
                <ChoiceItem>
                  <RadioGroupItem value="manual" />
                  {P.modeManual}
                </ChoiceItem>
              </RadioGroup>
            </fieldset>
            {mode === "manual" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${ids}-manual`}>{P.manualLabel}</Label>
                <PasswordInput
                  id={`${ids}-manual`}
                  autoComplete="off"
                  value={manual}
                  onChange={(event) => setManual(event.target.value)}
                  aria-invalid={error?.field ? true : undefined}
                  aria-describedby={`${ids}-manual-hint`}
                />
                <p id={`${ids}-manual-hint`} className="text-caption text-muted-foreground">
                  {P.manualHint}
                </p>
                <PasswordStrength password={manual} />
              </div>
            ) : null}
            {error ? (
              <p role="alert" className="flex items-start gap-2 text-caption text-danger-ink">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error.message}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {P.cancel}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <KeyRound aria-hidden />}
                {pending ? P.confirming : P.confirm}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
