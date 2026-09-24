"use client";

import { RotateCw, TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { LABELS } from "@/lib/constants/labels";

type ErrorStateProps = {
  title?: string;
  /** Explique quoi faire, en phrases courtes. */
  description?: string;
  onRetry?: () => void;
  className?: string;
};

export function ErrorState({
  title = LABELS.errors.genericTitle,
  description = LABELS.errors.genericDescription,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div role="alert" className={className}>
      <EmptyState
        icon={TriangleAlert}
        tone="danger"
        title={title}
        description={description}
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
