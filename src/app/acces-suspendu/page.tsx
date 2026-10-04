import { Lock, Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BrandStyle } from "@/components/layout/brand-style";
import { Logo } from "@/components/layout/logo";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { refreshAccess, signOut } from "@/lib/auth/actions";
import { ROUTES } from "@/lib/auth/routes";
import { getAuthState } from "@/lib/auth/session";
import { getSessionBrand } from "@/lib/branding";
import { LABELS } from "@/lib/constants/labels";
import { getSuspensionContact } from "@/lib/data/access";
import { formatPhone, toTelHref } from "@/lib/phone";

const L = LABELS.suspended;

export const metadata: Metadata = { title: L.title, robots: { index: false, follow: false } };

/** Centre suspendu ou résilié : explication et contact, sans aucune donnée du centre. */
export default async function SuspendedPage() {
  const state = await getAuthState();
  if (state.status === "anonymous") redirect(ROUTES.login);
  if (state.status === "no-profile") redirect(ROUTES.inactive);
  if (state.status === "student") redirect(ROUTES.student.login);
  const { profile } = state;
  const contact = await getSuspensionContact();
  const tel = contact.phone ? toTelHref(contact.phone) : null;
  const cancelled = profile.centerStatus === "cancelled";
  const brand = await getSessionBrand();

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <BrandStyle brand={brand} />
      <header className="flex h-16 items-center px-4 md:px-6">
        <Logo name={brand.name} logoUrl={brand.logoUrl} />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        {profile.blocked ? (
          <EmptyState
            icon={Lock}
            tone="danger"
            title={cancelled ? L.cancelledTitle : L.title}
            description={cancelled ? L.cancelledDescription(profile.centerName) : L.description(profile.centerName)}
            className="w-full max-w-lg"
            action={
              <div className="flex flex-col items-center gap-4">
                {contact.name || tel || contact.email ? (
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-caption text-muted-foreground">{L.contact(contact.name)}</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {tel && contact.phone ? (
                        <Button asChild variant="outline">
                          <a href={tel}>
                            <Phone aria-hidden />
                            <span className="numeric">{formatPhone(contact.phone)}</span>
                          </a>
                        </Button>
                      ) : null}
                      {contact.email ? (
                        <Button asChild variant="outline">
                          <a href={`mailto:${contact.email}`}>
                            <Mail aria-hidden />
                            {contact.email}
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap justify-center gap-2">
                  <form action={refreshAccess}>
                    <Button type="submit" variant="outline">
                      {L.retry}
                    </Button>
                  </form>
                  <form action={signOut}>
                    <Button type="submit">{LABELS.auth.userMenu.signOut}</Button>
                  </form>
                </div>
              </div>
            }
          />
        ) : (
          // Accès rétabli (ex. paiement enregistré) : le jeton est renouvelé avant de repartir.
          <EmptyState
            icon={Lock}
            title={L.restoredTitle}
            description={L.restoredDescription}
            className="w-full max-w-md"
            action={
              <form action={refreshAccess}>
                <Button type="submit">{L.continue}</Button>
              </form>
            }
          />
        )}
      </main>
    </div>
  );
}
