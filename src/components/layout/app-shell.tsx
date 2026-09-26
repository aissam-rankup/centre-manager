"use client";

import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Logo } from "@/components/layout/logo";
import { findActiveHref, type NavItem } from "@/components/layout/nav-types";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { type ShellUser, UserMenu } from "@/components/layout/user-menu";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NAVIGATION, type NavSpace } from "@/config/navigation";
import { LABELS } from "@/lib/constants/labels";
import { cn } from "@/lib/utils";

/** Au-delà de 5 entrées, la barre du bas affiche 4 entrées et un bouton « Plus ». */
const MAX_BOTTOM_ITEMS = 5;

type AppShellProps = {
  space: NavSpace;
  /** Utilisateur connecté (absent sur la charte graphique). */
  user?: ShellUser;
  /** Libellé de l'espace, affiché sous le logo de la barre latérale. */
  spaceLabel?: string;
  children: ReactNode;
};

export function AppShell({ space, user, spaceLabel, children }: AppShellProps) {
  const items = NAVIGATION[space];
  const home = items[0]?.href ?? "/";

  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-[10px] focus:bg-card focus:px-4 focus:py-3 focus:shadow-raised"
      >
        {LABELS.common.skipToContent}
      </a>

      {/* Barre latérale — desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex h-16 items-center px-6">
          <Link href={home} className="rounded-[10px]">
            <Logo variant="sidebar" />
          </Link>
        </div>
        {spaceLabel ? (
          <p className="px-6 pb-2 text-caption font-medium tracking-wide text-sidebar-muted uppercase">{spaceLabel}</p>
        ) : null}
        <SidebarNav items={items} />
      </aside>

      <div className="flex min-h-dvh flex-col lg:pl-64">
        {/* Barre supérieure */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-card/90 px-4 backdrop-blur md:px-6">
          <Link href={home} className="rounded-[10px] lg:hidden">
            <Logo />
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            {user ? <UserMenu user={user} /> : null}
          </div>
        </header>

        <main id="contenu" className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-32 md:px-6 md:pt-8 lg:pb-12">
          {children}
        </main>
      </div>

      <BottomNav items={items} />
    </div>
  );
}

function SidebarNav({ items }: { items: readonly NavItem[] }) {
  const activeHref = findActiveHref(items, usePathname());

  return (
    <nav aria-label={LABELS.nav.mainLabel} className="flex-1 px-3 py-2">
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const active = item.href === activeHref;
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-11 items-center gap-3 rounded-[10px] px-3 font-medium text-sidebar-muted transition-colors duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  active &&
                    "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-brand",
                )}
              >
                <Icon className="size-5 shrink-0" aria-hidden />
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function BottomNav({ items }: { items: readonly NavItem[] }) {
  const activeHref = findActiveHref(items, usePathname());
  const overflow = items.length > MAX_BOTTOM_ITEMS;
  const visible = overflow ? items.slice(0, MAX_BOTTOM_ITEMS - 1) : items;
  const hidden = overflow ? items.slice(MAX_BOTTOM_ITEMS - 1) : [];
  const hiddenActive = hidden.some((item) => item.href === activeHref);

  return (
    <nav
      aria-label={LABELS.nav.mainLabel}
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg">
        {visible.map((item) => {
          const active = item.href === activeHref;
          const Icon = item.icon;
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={item.shortLabel ? item.label : undefined}
                className={cn(tabClass, active && "text-brand-ink")}
              >
                <TabIcon icon={Icon} active={active} />
                <span className="max-w-full truncate">{item.shortLabel ?? item.label}</span>
              </Link>
            </li>
          );
        })}
        {overflow ? (
          <li className="min-w-0 flex-1">
            <Sheet>
              <SheetTrigger className={cn(tabClass, "w-full", hiddenActive && "text-brand-ink")}>
                <TabIcon icon={Ellipsis} active={hiddenActive} />
                <span>{LABELS.common.more}</span>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-2xl pb-[max(env(safe-area-inset-bottom),16px)]">
                <SheetTitle className="px-4 pt-4 text-section">{LABELS.common.more}</SheetTitle>
                <ul className="flex flex-col gap-1 px-2">
                  {hidden.map((item) => {
                    const Icon = item.icon;
                    const active = item.href === activeHref;
                    return (
                      <li key={item.href}>
                        <SheetClose asChild>
                          <Link
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "flex min-h-11 items-center gap-3 rounded-[10px] px-3 font-medium hover:bg-muted",
                              active && "text-brand-ink",
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
  "flex min-h-16 w-full flex-col items-center justify-center gap-1 px-1 text-caption font-medium text-muted-foreground transition-colors duration-200";

/** Icône d'onglet ; l'onglet actif est repéré par une pastille teintée (en plus de la couleur du texte). */
function TabIcon({ icon: Icon, active }: { icon: NavItem["icon"]; active: boolean }) {
  return (
    <span
      className={cn(
        "flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200",
        active && "bg-brand/10",
      )}
    >
      <Icon className="size-6" aria-hidden />
    </span>
  );
}
