import { Building2 } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { getRootUrl } from "@/lib/center-host";
import { LABELS } from "@/lib/constants/labels";

const L = LABELS.centerHost;

export const metadata: Metadata = { title: L.notFoundTitle, robots: { index: false } };

/** Sous-domaine sans centre (servi en 404 par le proxy) : lien vers le domaine racine. */
export default function CenterNotFoundPage() {
  const root = getRootUrl("/");
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <EmptyState
        icon={Building2}
        title={L.notFoundTitle}
        description={L.notFoundDescription}
        className="w-full max-w-md"
        action={
          <Button asChild>
            <a href={root}>{L.notFoundLink(root.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>
          </Button>
        }
      />
    </main>
  );
}
