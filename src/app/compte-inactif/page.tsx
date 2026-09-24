import { UserX } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Logo } from "@/components/layout/logo";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { refreshAccess, signOut } from "@/lib/auth/actions";
import { ROLE_HOME, ROUTES } from "@/lib/auth/routes";
import { getAuthState } from "@/lib/auth/session";
import { LABELS } from "@/lib/constants/labels";

const L = LABELS.auth.inactive;

export const metadata: Metadata = { title: L.title };

export default async function InactiveAccountPage() {
  const state = await getAuthState();
  if (state.status === "anonymous") redirect(ROUTES.login);
  // Compte actif (ex. réactivé depuis) : retour à son espace.
  if (state.status === "authenticated" && state.profile.active) redirect(ROLE_HOME[state.profile.role]);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-16 items-center px-4 md:px-6">
        <Logo />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <EmptyState
          icon={UserX}
          tone="danger"
          title={L.title}
          description={L.description}
          className="w-full max-w-md"
          action={
            <>
              <form action={refreshAccess}>
                <Button type="submit" variant="outline">
                  {L.retry}
                </Button>
              </form>
              <form action={signOut}>
                <Button type="submit">{LABELS.auth.userMenu.signOut}</Button>
              </form>
            </>
          }
        />
      </main>
    </div>
  );
}
