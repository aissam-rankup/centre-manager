import { KeyRound, LogOut } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ChangePasswordForm } from "@/components/password/change-password-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { signOut } from "@/lib/auth/actions";
import { signOutStudent } from "@/lib/auth/student-actions";
import { ROUTES } from "@/lib/auth/routes";
import { getAuthState } from "@/lib/auth/session";
import { LABELS } from "@/lib/constants/labels";

const P = LABELS.passwords;

export const metadata: Metadata = { title: P.forced.title };

/** Mot de passe temporaire (défini par un responsable) : à remplacer avant toute autre page. */
export default async function ForcedPasswordPage() {
  const state = await getAuthState();
  if (state.status === "anonymous") redirect(ROUTES.login);
  if (state.status === "no-profile") redirect(ROUTES.inactive);
  const mustChange = state.status === "student" ? state.student.mustChangePassword : state.profile.mustChangePassword;
  // Déjà fait (jeton en retard) : jeton renouvelé, puis espace du rôle.
  if (!mustChange) redirect(ROUTES.refreshSession);

  return (
    <Card className="w-full max-w-md">
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-title text-primary dark:text-foreground">
            <KeyRound className="size-6 shrink-0" aria-hidden />
            {P.forced.title}
          </h1>
          <p className="text-muted-foreground">{P.forced.description}</p>
        </div>
        <ChangePasswordForm mode="forced" />
        <form action={state.status === "student" ? signOutStudent : signOut}>
          <Button type="submit" variant="ghost" className="w-full text-muted-foreground">
            <LogOut aria-hidden />
            {LABELS.auth.userMenu.signOut}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
