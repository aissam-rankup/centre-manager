import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CenterNotice } from "@/components/auth/center-notice";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/lib/auth/routes";
import { getAuthState } from "@/lib/auth/session";
import { getCurrentCenter } from "@/lib/branding";
import { LABELS } from "@/lib/constants/labels";

import { StudentLoginForm } from "./student-login-form";

const L = LABELS.studentLogin;

export const metadata: Metadata = { title: L.title };

/** Connexion de l'élève par le code fourni par son centre. */
export default async function StudentLoginPage({ searchParams }: PageProps<"/eleve/connexion">) {
  const state = await getAuthState();
  // Élève déjà connecté avec un accès valide : son espace.
  if (state.status === "student" && state.student.allowed) redirect(ROUTES.student.home);
  const params = await searchParams;
  const { acces } = params;
  const current = await getCurrentCenter();
  const disabled = acces === "coupe" || (state.status === "student" && !state.student.allowed);

  return (
    <Card className="w-full max-w-md">
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-title text-primary dark:text-foreground">{L.title}</h1>
          <p className="text-muted-foreground">{L.description}</p>
        </div>
        {disabled ? (
          <p role="alert" className="flex items-start gap-3 rounded-lg bg-danger/10 px-4 py-3 text-danger-ink">
            <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
            {L.disabled}
          </p>
        ) : null}
        <CenterNotice params={params} currentSlug={current?.slug ?? null} />
        <StudentLoginForm />
        <Link href={ROUTES.login} className="text-caption text-muted-foreground underline-offset-4 hover:underline">
          {L.staffLink}
        </Link>
      </CardContent>
    </Card>
  );
}
