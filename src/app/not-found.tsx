import { SearchX } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { LABELS } from "@/lib/constants/labels";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <EmptyState
        icon={SearchX}
        title={LABELS.errors.notFoundTitle}
        description={LABELS.errors.notFoundDescription}
        className="w-full max-w-md"
        action={
          <Button asChild>
            <Link href="/">{LABELS.errors.backHome}</Link>
          </Button>
        }
      />
    </main>
  );
}
