import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/card";
import { NEXT_PARAM, safeNextPath } from "@/lib/auth/routes";
import { LABELS } from "@/lib/constants/labels";

import { LoginForm } from "./login-form";

const L = LABELS.auth.login;

export const metadata: Metadata = { title: L.title };

export default async function LoginPage({ searchParams }: PageProps<"/connexion">) {
  const params = await searchParams;
  const rawNext = params[NEXT_PARAM];
  const next = safeNextPath(typeof rawNext === "string" ? rawNext : null);

  return (
    <Card className="w-full max-w-md">
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-title text-primary dark:text-foreground">{L.title}</h1>
          <p className="text-muted-foreground">{L.description}</p>
        </div>
        <LoginForm next={next} />
        <p className="text-caption text-muted-foreground">{L.forgotten}</p>
      </CardContent>
    </Card>
  );
}
