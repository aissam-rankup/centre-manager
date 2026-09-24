"use client";

import { TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { LABELS } from "@/lib/constants/labels";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <EmptyState
        icon={TriangleAlert}
        title={LABELS.errors.generic}
        className="w-full max-w-md"
        action={<Button onClick={reset}>{LABELS.common.retry}</Button>}
      />
    </main>
  );
}
