"use client";

import { RotateCw, TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { useLabels } from "@/lib/i18n/client";

type ErrorStateProps = {
  title?: string;
  /** Explique quoi faire, en phrases courtes. */
  description?: string;
  onRetry?: () => void;
  className?: string;
};

export function ErrorState({ title, description, onRetry, className }: ErrorStateProps) {
  const LABELS = useLabels();
  return (
    <div role="alert" className={className}>
      <EmptyState
        icon={TriangleAlert}
        tone="danger"
        title={title ?? LABELS.errors.genericTitle}
        description={description ?? LABELS.errors.genericDescription}
        action={
          onRetry ? (
            <Button onClick={onRetry}>
              <RotateCw aria-hidden />
              {LABELS.common.retry}
            </Button>
          ) : null
        }
      />
    </div>
  );
}
