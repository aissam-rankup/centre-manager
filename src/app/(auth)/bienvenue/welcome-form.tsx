"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, LoaderCircle, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LABELS } from "@/lib/constants/labels";
import { useLabels } from "@/lib/i18n/client";
import { createClient } from "@/lib/supabase/client";

// Messages de validation en français : affichés dans la langue de l'utilisateur par FormField.
const V = LABELS.welcome;

const passwordSchema = z
  .object({
    password: z.string().min(8, V.tooShort).max(72, V.tooShort),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, { message: V.mismatch, path: ["confirm"] });
type PasswordInput = z.infer<typeof passwordSchema>;

type LinkState = { status: "checking" } | { status: "invalid" } | { status: "ready"; email: string };

/**
 * Le lien d'invitation arrive soit avec les jetons dans le fragment d'URL
 * (modèle de courriel par défaut), soit avec « token_hash » en paramètre
 * (modèle personnalisé). La session est ouverte ici, côté navigateur.
 */
async function openSessionFromLink(): Promise<LinkState> {
  const supabase = createClient();
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const query = new URLSearchParams(window.location.search);
  // Les jetons ne restent pas dans la barre d'adresse ni dans l'historique.
  if (window.location.hash || query.has("token_hash")) window.history.replaceState(null, "", window.location.pathname);

  if (hash.get("error")) return { status: "invalid" };
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  const tokenHash = query.get("token_hash");

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) return { status: "invalid" };
  } else if (tokenHash) {
    const type = query.get("type") === "recovery" ? "recovery" : "invite";
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return { status: "invalid" };
  }

  const { data } = await supabase.auth.getUser();
  return data.user?.email ? { status: "ready", email: data.user.email } : { status: "invalid" };
}

// Le jeton du lien est à usage unique : une seule tentative par chargement de
// page, partagée entre les montages successifs de l'effet (mode strict).
let linkPromise: Promise<LinkState> | null = null;

export function WelcomeForm() {
  const L = useLabels().welcome;
  const router = useRouter();
  const [link, setLink] = useState<LinkState>({ status: "checking" });
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    linkPromise ??= openSessionFromLink();
    void linkPromise.then((state) => {
      if (!cancelled) setLink(state);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PasswordInput>({ resolver: zodResolver(passwordSchema), defaultValues: { password: "", confirm: "" } });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const { error } = await createClient().auth.updateUser({ password: values.password });
      if (error) {
        setServerError(error.code === "weak_password" ? L.weak : L.failed);
        return;
      }
      // Navigation serveur : le proxy oriente vers l'espace du rôle.
      router.replace("/");
      router.refresh();
    });
  });

  if (link.status === "checking") {
    return (
      <p className="flex items-center gap-2 text-muted-foreground" role="status">
        <LoaderCircle className="size-5 animate-spin" aria-hidden />
        {L.checking}
      </p>
    );
  }

  if (link.status === "invalid") {
    return (
      <div role="alert" className="flex items-start gap-3 rounded-lg bg-danger/10 px-4 py-3 text-danger-ink">
        <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="flex flex-col gap-1">
          <p className="font-semibold">{L.invalidTitle}</p>
          <p>{L.invalidDescription}</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-caption text-muted-foreground">{L.signedInAs(link.email)}</p>
      {serverError ? (
        <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-danger-ink">
          {serverError}
        </p>
      ) : null}
      <FormField id="password" label={L.password} hint={L.passwordHint} error={errors.password?.message}>
        <Input type="password" autoComplete="new-password" {...register("password")} />
      </FormField>
      <FormField id="confirm" label={L.confirm} error={errors.confirm?.message}>
        <Input type="password" autoComplete="new-password" {...register("confirm")} />
      </FormField>
      <Button type="submit" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <KeyRound aria-hidden />}
        {pending ? L.submitting : L.submit}
      </Button>
    </form>
  );
}
