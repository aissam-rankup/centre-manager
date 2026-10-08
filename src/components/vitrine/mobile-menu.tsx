"use client";

import { LogIn, Menu } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DemoButton } from "@/components/vitrine/demo-button";
import { localeProps } from "@/components/vitrine/fonts";
import { ROUTES } from "@/lib/auth/routes";
import type { Locale } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";
import { VITRINE } from "@/lib/vitrine/content";

/** Menu du téléphone : sections, connexion et demande de démo. */
export function MobileMenu({ locale }: { locale: Locale }) {
  const t = VITRINE[locale].nav;
  const [open, setOpen] = useState(false);
  const props = localeProps(locale);
  const links = [
    { href: "#features", label: t.features },
    { href: "#plans", label: t.plans },
    { href: "#faq", label: t.faq },
  ];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t.menu} className="md:hidden">
          <Menu aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent
        side={props.dir === "rtl" ? "left" : "right"}
        lang={props.lang}
        dir={props.dir}
        style={props.style}
        className={cn("w-[85%] gap-6 p-6", props.className)}
      >
        <SheetTitle className="text-section text-heading">{t.menu}</SheetTitle>
        <nav className="flex flex-col gap-1">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-3 text-body font-medium text-heading hover:bg-muted"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3">
          <Button asChild variant="outline" className="gap-2">
            <a href={ROUTES.login}>
              <LogIn aria-hidden className="rtl:rotate-180" />
              {t.login}
            </a>
          </Button>
          <DemoButton locale={locale} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
