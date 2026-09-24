"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Logo } from "@/components/layout/logo";
import { isNavItemActive, type NavItem } from "@/components/layout/nav-types";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NAVIGATION, type NavSpace } from "@/config/navigation";
import { LABELS } from "@/lib/constants/labels";
import { cn } from "@/lib/utils";

/** Au-delà, la barre d'onglets mobile laisse la place au menu latéral. */
const MAX_BOTTOM_TABS = 5;

type AppShellProps = {
  space: NavSpace;
  children: ReactNode;
};

export function AppShell({ space, children }: AppShellProps) {
  const items = NAVIGATION[space];
  const showBottomTabs = items.length >= 2 && items.length <= MAX_BOTTOM_TABS;

  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-xl focus:bg-card focus:px-4 focus:py-3 focus:shadow-raised"
      >
        {LABELS.common.skipToContent}
      </a>

      {/* Barre latérale — desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar lg:flex">
        <div className="flex h-16 items-center px-5">
          <Link href={items[0]?.href ?? "/"} className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <Logo />
          </Link>
        </div>
        <NavList items={items} className="flex-1 px-3 py-2" />
      </aside>

      <div className="flex min-h-dvh flex-col lg:pl-64">
        {/* Barre supérieure */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-6">
          {!showBottomTabs ? <MobileMenu items={items} /> : null}
          <Link href={items[0]?.href ?? "/"} className="lg:hidden">
            <Logo />
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
          </div>
        </header>

        <main
          id="contenu"
          className={cn(
            "mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6 md:py-8",
            showBottomTabs && "pb-28 lg:pb-8",
          )}
        >
          {children}
        </main>
      </div>

      {showBottomTabs ? <BottomTabs items={items} /> : null}
    </div>
  );
}

function NavList({ items, className, onNavigate }: { items: readonly NavItem[]; className?: string; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label={LABELS.nav.mainLabel} className={className}>
      <ul className="flex flex-col gap-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isNavItemActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                  active && "bg-sidebar-accent text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-5 shrink-0" aria-hidden />
                <span className="truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function MobileMenu({ items }: { items: readonly NavItem[] }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" aria-label={LABELS.common.openMenu}>
          <Menu className="size-5" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 bg-sidebar p-0">
        <div className="flex h-16 items-center border-b px-5">
          <SheetTitle asChild>
            <div>
              <Logo />
            </div>
          </SheetTitle>
        </div>
        <NavList items={items} className="px-3 py-2" />
      </SheetContent>
    </Sheet>
  );
}

function BottomTabs({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label={LABELS.nav.mainLabel}
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isNavItemActive(pathname, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-xs font-medium text-muted-foreground outline-none focus-visible:bg-accent",
                  active && "text-primary",
                )}
              >
                <Icon className="size-6" aria-hidden />
                <span className="max-w-full truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
