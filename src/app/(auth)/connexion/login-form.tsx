"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LoaderCircle, LogIn, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/lib/auth/actions";
import { type LoginInput, loginSchema } from "@/lib/auth/schemas";
import { LABELS } from "@/lib/constants/labels";

const L = LABELS.auth.login;

export function LoginForm({ next }: { next: string | null }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      // En cas de succès, la Server Action redirige : aucun retour.
      const result = await signIn(values, next);
      if (result?.error) setServerError(result.error);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {serverError ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-[10px] bg-danger/10 px-4 py-3 text-danger-ink"
        >
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>{serverError}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{L.email}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          placeholder={L.emailPlaceholder}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "email-error" : undefined}
          {...register("email")}
        />
        {errors.email ? (
          <p id="email-error" className="text-caption text-danger-ink">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{L.password}</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            className="pr-12"
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? "password-error" : undefined}
            {...register("password")}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-0 right-0"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? L.hidePassword : L.showPassword}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          </Button>
        </div>
        {errors.password ? (
          <p id="password-error" className="text-caption text-danger-ink">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      <Button type="submit" className="mt-2 w-full" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <LogIn aria-hidden />}
        {pending ? L.submitting : L.submit}
      </Button>
    </form>
  );
}
