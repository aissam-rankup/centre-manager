"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { LABELS } from "@/lib/constants/labels";

const L = LABELS.styleguide.toasts;

export function ToastDemo() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" onClick={() => toast.success(L.success, { description: L.successDescription })}>
        {L.trigger}
      </Button>
      <Button variant="outline" onClick={() => toast.error(L.error, { description: L.errorDescription })}>
        {L.errorTrigger}
      </Button>
    </div>
  );
}
