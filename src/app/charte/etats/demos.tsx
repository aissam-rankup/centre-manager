"use client";

import { toast } from "sonner";

import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { useLabels } from "@/lib/i18n/client";

export function ErrorDemo() {
  const LABELS = useLabels();
  const L = LABELS.styleguide;
  return (
    <ErrorState
      title={L.errorState.title}
      description={L.errorState.description}
      onRetry={() => toast(LABELS.common.loading)}
    />
  );
}

export function ToastDemo() {
  const L = useLabels().styleguide;
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" onClick={() => toast.success(L.toasts.success, { description: L.toasts.successDescription })}>
        {L.toasts.successTrigger}
      </Button>
      <Button variant="outline" onClick={() => toast.error(L.toasts.error, { description: L.toasts.errorDescription })}>
        {L.toasts.errorTrigger}
      </Button>
    </div>
  );
}
