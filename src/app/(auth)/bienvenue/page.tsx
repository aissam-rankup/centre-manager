import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/card";
import { getLabels } from "@/lib/i18n/server";

import { WelcomeForm } from "./welcome-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLabels()).welcome.title, robots: { index: false, follow: false } };
}

/** Accueil d'un compte invité : ouverture de la session depuis le lien, puis choix du mot de passe. */
export default async function WelcomePage() {
  const L = (await getLabels()).welcome;
  return (
    <Card className="w-full max-w-md">
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-title text-primary dark:text-foreground">{L.title}</h1>
          <p className="text-muted-foreground">{L.description}</p>
        </div>
        <WelcomeForm />
      </CardContent>
    </Card>
  );
}
