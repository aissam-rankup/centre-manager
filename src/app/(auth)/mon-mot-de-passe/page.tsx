import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/components/shared/app-link";
import { redirect } from "next/navigation";

import { ChangePasswordForm } from "@/components/password/change-password-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/lib/auth/routes";
import { getAuthState } from "@/lib/auth/session";
import { LABELS } from "@/lib/constants/labels";

const P = LABELS.passwords;

export const metadata: Metadata = { title: P.mine.title };

/** « Mon mot de passe » : tous les rôles (équipe, élève, console). */
export default async function MyPasswordPage() {
  const state = await getAuthState();
  if (state.status === "anonymous") redirect(ROUTES.login);
  if (state.status === "no-profile") redirect(ROUTES.inactive);
  if (state.status === "student" ? state.student.mustChangePassword : state.profile.mustChangePassword) redirect(ROUTES.forcedPassword);
  // Le support (super-admin chez un centre) ne change pas de mot de passe depuis l'espace du centre.
  if (state.status === "authenticated" && state.profile.support) redirect("/");

  return (
    <Card className="w-full max-w-md">
      <CardContent className="flex flex-col gap-6">
        <Button asChild variant="ghost" className="-ml-3 self-start">
          <Link href="/">
            <ArrowLeft aria-hidden />
            {P.mine.back}
          </Link>
        </Button>
        <div className="flex flex-col gap-1">
          <h1 className="text-title text-primary dark:text-foreground">{P.mine.title}</h1>
          <p className="text-muted-foreground">{P.mine.description}</p>
        </div>
        <ChangePasswordForm mode="mine" />
      </CardContent>
    </Card>
  );
}
