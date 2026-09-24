"use client";

import { ErrorState } from "@/components/shared/error-state";

export default function SpaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState onRetry={reset} />;
}
