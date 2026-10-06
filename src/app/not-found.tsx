import { SearchX } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { LABELS } from "@/lib/constants/labels";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-4">
      <Logo height={32} />
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
