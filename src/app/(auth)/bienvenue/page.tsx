import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/card";
import { LABELS } from "@/lib/constants/labels";

import { WelcomeForm } from "./welcome-form";

const L = LABELS.welcome;

export const metadata: Metadata = { title: L.title, robots: { index: false, follow: false } };

/** Accueil d'un compte invité : ouverture de la session depuis le lien, puis choix du mot de passe. */
export default function WelcomePage() {
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
