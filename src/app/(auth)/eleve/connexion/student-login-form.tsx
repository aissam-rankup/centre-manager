"use client";

import { Eye, EyeOff, LoaderCircle, LogIn, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInStudent } from "@/lib/auth/student-actions";
import { useLabels, useMessage } from "@/lib/i18n/client";

export function StudentLoginForm() {
  const LABELS = useLabels();
  const L = LABELS.studentLogin;
  const message = useMessage();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      // En cas de succès, la Server Action redirige : aucun retour.
      const result = await signInStudent({ code, password });
      if ("location" in result) window.location.assign(result.location);
      else setError(result.error);
    });
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {error ? (
        <div role="alert" className="flex items-start gap-3 rounded-lg bg-danger/10 px-4 py-3 text-danger-ink">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>{message(error)}</p>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="code">{L.code}</Label>
        <Input
          id="code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="username"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder={L.codePlaceholder}
          className="numeric tracking-wider uppercase"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{L.password}</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            className="pe-12"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-0 end-0"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? LABELS.auth.login.hidePassword : LABELS.auth.login.showPassword}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          </Button>
        </div>
      </div>
      <Button type="submit" className="mt-2 w-full" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <LogIn aria-hidden />}
        {pending ? L.submitting : L.submit}
      </Button>
    </form>
  );
}
