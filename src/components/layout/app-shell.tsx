"use client";

import { Ellipsis, GraduationCap, LogOut, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useTransition } from "react";

import { findActiveHref, type NavItem } from "@/components/layout/nav-types";
import { NotificationBell } from "@/components/layout/notification-bell";
import { type ShellUser, UserMenu } from "@/components/layout/user-menu";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { navigationFor, type NavSpace } from "@/config/navigation";
import { signOut } from "@/lib/auth/actions";
import { useLabels } from "@/lib/i18n/client";
import type { NotificationItem } from "@/lib/data/notifications";
import { cn } from "@/lib/utils";

/** Au-delà de 5 entrées, la barre du bas affiche 4 entrées et un bouton « Plus ». */
const MAX_BOTTOM_ITEMS = 5;

type AppShellProps = {
  space: NavSpace;
  /** Utilisateur connecté (absent sur la charte graphique). */
  user?: ShellUser;
  /** Libellé de l'espace (accessibilité de la barre latérale). */
  spaceLabel?: string;
  /** Date du jour à Casablanca, « 27 septembre 2026 ». */
  todayLabel?: string;
  /** Page de la liste des élèves : active la recherche de l'en-tête. */
  searchHref?: string;
  /** Cloche de notifications (admin, assistant) ; liens vers les fiches de « fileBase ». */
  notifications?: { items: NotificationItem[]; fileBase: string };
  /** Bandeaux permanents en haut de page (retard de paiement, mode support). */
  banners?: ReactNode;
  /** Logo de la marque du centre (marque blanche) ; icône de la plateforme sinon. */
  logoUrl?: string | null;
  /** Entrée « Marque » (administrateur d'un centre en marque blanche). */
  brandingEditable?: boolean;
  children: ReactNode;
};

/**
 * Coque « dashboard SaaS » : fond dégradé, conteneur flottant arrondi,
 * barre latérale violette à icônes (≥ 768 px), en-tête de 88 px,
 * barre de navigation violette en bas sur mobile.
 */
export function AppShell({
  space,
  user,
  spaceLabel,
  todayLabel,
  searchHref,
  notifications,
  banners,
  logoUrl = null,
  brandingEditable = false,
  children,
}: AppShellProps) {
  const LABELS = useLabels();
  const items = navigationFor(LABELS, { brandingEditable })[space];
  const home = items[0]?.href ?? "/";
  const pathname = usePathname();
  const activeHref = findActiveHref(items, pathname);
  const sectionTitle = items.find((item) => item.href === activeHref)?.label ?? "";

  return (
    <div className="min-h-dvh bg-background md:bg-app md:p-4 lg:p-8">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-card focus:px-4 focus:py-3 focus:shadow-raised"
      >
        {LABELS.common.skipToContent}
      </a>

      <div className="flex min-h-dvh bg-background md:h-[calc(100dvh-32px)] md:min-h-0 md:overflow-hidden md:rounded-4xl md:shadow-shell lg:h-[calc(100dvh-64px)]">
        <Sidebar items={items} activeHref={activeHref} home={home} label={spaceLabel} withSignOut={Boolean(user)} logoUrl={logoUrl} />

        <div className="flex min-w-0 flex-1 flex-col">
          {banners}
          <header className="flex flex-col gap-3 px-4 pt-4 md:h-[88px] md:flex-row md:items-center md:gap-6 md:px-8 md:pt-0">
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 truncate text-title text-heading" aria-hidden>
                {sectionTitle}
              </p>
              {user ? (
                <div className="flex items-center gap-1 md:hidden">
                  {notifications ? <NotificationBell items={notifications.items} fileBase={notifications.fileBase} /> : null}
                  <UserMenu user={user} />
                </div>
              ) : null}
            </div>

            {searchHref ? <HeaderSearch action={searchHref} /> : <div className="hidden flex-1 md:block" />}

            <div className="hidden shrink-0 items-center gap-4 md:flex">
              {todayLabel ? <span className="text-caption text-subtle">{todayLabel}</span> : null}
              {notifications ? <NotificationBell items={notifications.items} fileBase={notifications.fileBase} /> : null}
              {user ? <UserMenu user={user} /> : null}
            </div>
          </header>

          <main id="contenu" className="flex-1 px-4 pt-4 pb-28 md:overflow-y-auto md:px-8 md:pt-0 md:pb-8">
            {children}
          </main>
        </div>
      </div>

      <BottomNav items={items} activeHref={activeHref} />
    </div>
  );
}

// ---------------------------------------------------------------------
// Recherche d'élève (admin, assistant) : ouvre la liste filtrée.
// ---------------------------------------------------------------------
function HeaderSearch({ action }: { action: string }) {
  const LABELS = useLabels();
  return (
    <form action={action} role="search" className="md:flex md:flex-1 md:justify-center">
      <label className="relative flex h-9 w-full items-center md:w-[300px]">
        <span className="sr-only">{LABELS.nav.searchStudent}</span>
        <Search className="pointer-events-none absolute left-3.5 size-3.5 text-subtle" aria-hidden />
        <input
          type="search"
          name="q"
          placeholder={LABELS.nav.searchStudent}
          className="h-full w-full rounded-full border border-border bg-card pr-4 pl-9 text-table text-foreground outline-none placeholder:text-caption placeholder:text-subtle focus-visible:border-primary"
        />
      </label>
    </form>
  );
}

// ---------------------------------------------------------------------
// Barre latérale violette, icônes seules (≥ 768 px)
// ---------------------------------------------------------------------
type SidebarProps = {
  items: readonly NavItem[];
  activeHref: string | null;
  home: string;
  label?: string;
  withSignOut: boolean;
  logoUrl: string | null;
};

function Sidebar({ items, activeHref, home, label, withSignOut, logoUrl }: SidebarProps) {
  const LABELS = useLabels();
  const [pending, startTransition] = useTransition();

  return (
    <aside
      aria-label={label}
      className="hidden w-[72px] shrink-0 flex-col items-center rounded-3xl bg-sidebar pt-5 pb-10 text-sidebar-foreground md:flex"
    >
      <Link href={home} className="flex size-10 items-center justify-center rounded-lg" aria-label={LABELS.app.name}>
        {logoUrl ? (
          // Logo du client (marque blanche) : image externe du bucket public, taille fixe.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="size-10 rounded-lg bg-white object-contain p-1" />
        ) : (
          <GraduationCap className="size-6" aria-hidden />
        )}
      </Link>

      <nav aria-label={LABELS.nav.mainLabel} className="mt-[20px] flex flex-col items-center gap-2">
        {items.map((item) => (
          <SidebarLink key={item.href} item={item} active={item.href === activeHref} />
        ))}
      </nav>

      {withSignOut ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => signOut())}
              aria-label={LABELS.common.signOut}
              className="mt-auto flex size-10 items-center justify-center rounded-lg text-sidebar-muted transition-colors duration-200 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <LogOut className="size-5" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{LABELS.common.signOut}</TooltipContent>
        </Tooltip>
      ) : null}
    </aside>
  );
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          aria-label={item.label}
          className={cn(
            "flex size-10 items-center justify-center rounded-lg transition-colors duration-200",
            active
              ? "bg-sidebar-accent text-sidebar-foreground"
              : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground",
          )}
        >
          <Icon className="size-5" aria-hidden />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------
// Barre de navigation violette en bas (< 768 px)
// ---------------------------------------------------------------------
function BottomNav({ items, activeHref }: { items: readonly NavItem[]; activeHref: string | null }) {
  const LABELS = useLabels();
  const overflow = items.length > MAX_BOTTOM_ITEMS;
  const visible = overflow ? items.slice(0, MAX_BOTTOM_ITEMS - 1) : items;
  const hidden = overflow ? items.slice(MAX_BOTTOM_ITEMS - 1) : [];
  const hiddenActive = hidden.some((item) => item.href === activeHref);

  return (
    <nav
      aria-label={LABELS.nav.mainLabel}
      className="fixed inset-x-0 bottom-0 z-30 rounded-t-3xl bg-sidebar pb-[env(safe-area-inset-bottom)] text-sidebar-foreground md:hidden"
    >
      <ul className="mx-auto flex h-16 max-w-lg items-center px-2">
        {visible.map((item) => {
          const active = item.href === activeHref;
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                className={tabClass}
              >
                <TabIcon icon={item.icon} active={active} />
                <span className="max-w-full truncate">{item.shortLabel ?? item.label}</span>
              </Link>
            </li>
          );
        })}
        {overflow ? (
          <li className="min-w-0 flex-1">
            <Sheet>
              <SheetTrigger className={cn(tabClass, "w-full")}>
                <TabIcon icon={Ellipsis} active={hiddenActive} />
                <span>{LABELS.common.more}</span>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-3xl pb-[max(env(safe-area-inset-bottom),16px)]">
                <SheetTitle className="px-4 pt-4 text-section">{LABELS.common.more}</SheetTitle>
                <ul className="flex flex-col gap-1 px-2">
                  {hidden.map((item) => {
                    const active = item.href === activeHref;
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <SheetClose asChild>
                          <Link
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "flex min-h-11 items-center gap-3 rounded-lg px-3 font-medium transition-colors hover:bg-muted",
                              active && "bg-primary-soft text-primary",
                            )}
                          >
                            <Icon className="size-5" aria-hidden />
                            {item.label}
                          </Link>
                        </SheetClose>
                      </li>
                    );
                  })}
                </ul>
              </SheetContent>
            </Sheet>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}

const tabClass =
  "flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium text-sidebar-foreground";

/** Icône d'onglet ; l'onglet actif est repéré par un fond blanc à 20 %. */
function TabIcon({ icon: Icon, active }: { icon: NavItem["icon"]; active: boolean }) {
  return (
    <span
      className={cn(
        "flex h-8 w-12 items-center justify-center rounded-lg transition-colors duration-200",
        active ? "bg-sidebar-accent" : "opacity-70",
      )}
    >
      <Icon className="size-5" aria-hidden />
    </span>
  );
}
