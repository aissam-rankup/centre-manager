"use client";

import { ErrorState } from "@/components/shared/error-state";

import "./globals.css";

/** Erreur dans le layout racine : remplace toute la page, d'où html et body. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr">
      <body>
        <main className="flex min-h-dvh items-center justify-center p-4">
          <ErrorState onRetry={reset} className="w-full max-w-md" />
        </main>
      </body>
    </html>
  );
}
