import type { Metadata } from "next";
import Link from "@/components/shared/app-link";

import { CenterNotice } from "@/components/auth/center-notice";
import { Card, CardContent } from "@/components/ui/card";
import { NEXT_PARAM, ROUTES, safeNextPath } from "@/lib/auth/routes";
import { getCurrentCenter } from "@/lib/branding";
import { LABELS } from "@/lib/constants/labels";

import { AuthLinkRedirect } from "./auth-link-redirect";
import { LoginForm } from "./login-form";

const L = LABELS.auth.login;

export const metadata: Metadata = { title: L.title };

export default async function LoginPage({ searchParams }: PageProps<"/connexion">) {
  const params = await searchParams;
  const rawNext = params[NEXT_PARAM];
  const next = safeNextPath(typeof rawNext === "string" ? rawNext : null);
  const current = await getCurrentCenter();

  return (
    <Card className="w-full max-w-md">
      <AuthLinkRedirect />
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-title text-primary dark:text-foreground">{L.title}</h1>
          <p className="text-muted-foreground">{L.description}</p>
        </div>
        <CenterNotice params={params} currentSlug={current?.slug ?? null} />
        <LoginForm next={next} />
        <p className="text-caption text-muted-foreground">{L.forgotten}</p>
        <Link href={ROUTES.student.login} className="text-caption text-muted-foreground underline-offset-4 hover:underline">
          {LABELS.studentLogin.studentLink}
        </Link>
      </CardContent>
    </Card>
  );
}
