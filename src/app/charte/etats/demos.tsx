"use client";

import { toast } from "sonner";

import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { LABELS } from "@/lib/constants/labels";

const L = LABELS.styleguide;

export function ErrorDemo() {
  return (
    <ErrorState
      title={L.errorState.title}
      description={L.errorState.description}
      onRetry={() => toast(LABELS.common.loading)}
    />
  );
}

export function ToastDemo() {
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
