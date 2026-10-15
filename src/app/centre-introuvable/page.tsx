import { Building2 } from "lucide-react";
import type { Metadata } from "next";

import { Logo } from "@/components/brand/logo";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { getRootUrl } from "@/lib/center-host";
import { getLabels } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLabels()).centerHost.notFoundTitle, robots: { index: false } };
}

/** Sous-domaine sans centre (servi en 404 par le proxy) : lien vers le domaine racine. */
export default async function CenterNotFoundPage() {
  const L = (await getLabels()).centerHost;
  const root = getRootUrl("/");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-4">
      <Logo height={32} />
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
