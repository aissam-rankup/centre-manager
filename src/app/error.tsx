"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <ErrorState onRetry={reset} className="w-full max-w-md" />
    </main>
  );
}
