import {
  ArrowRight,
  BellRing,
  BookOpenCheck,
  Building2,
  CalendarRange,
  Check,
  CircleCheck,
  Coins,
  GraduationCap,
  Languages,
  LogIn,
  type LucideIcon,
  MessageCircle,
  Palette,
  Plus,
  ReceiptText,
  RefreshCw,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { DemoButton } from "@/components/vitrine/demo-button";
import { localeProps } from "@/components/vitrine/fonts";
import { LanguageSwitcher } from "@/components/vitrine/language-switcher";
import { MobileMenu } from "@/components/vitrine/mobile-menu";
import { ROUTES } from "@/lib/auth/routes";
import type { Locale } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";
import { DEMO_WHATSAPP, type FeatureKey, VITRINE } from "@/lib/vitrine/content";

const FEATURE_ICONS: Record<FeatureKey, LucideIcon> = {
  students: Users,
  payments: ReceiptText,
  absences: BellRing,
  schedule: CalendarRange,
  payroll: Coins,
  cash: Wallet,
  reenrollment: RefreshCw,
  studentSpace: BookOpenCheck,
  whiteLabel: Palette,
};
const PREMIUM_FEATURES: readonly FeatureKey[] = ["studentSpace", "whiteLabel"];
const AUDIENCE_ICONS: readonly LucideIcon[] = [GraduationCap, Languages, Building2, Sparkles];

/** Page vitrine de dirassty.com (visiteurs non connectés du domaine racine). */
export function Vitrine({ locale }: { locale: Locale }) {
  const t = VITRINE[locale];
  const props = localeProps(locale);

  return (
    <div lang={props.lang} dir={props.dir} style={props.style} className={cn("min-h-dvh bg-background text-foreground", props.className)}>
      {/* En-tête */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 md:px-6">
          <a href="#contenu" className="shrink-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="dirassty">
            <Logo height={26} priority decorative />
          </a>
          <nav aria-label={t.nav.menu} className="ms-6 hidden items-center gap-1 md:flex">
            <NavLink href="#features">{t.nav.features}</NavLink>
            <NavLink href="#plans">{t.nav.plans}</NavLink>
            <NavLink href="#faq">{t.nav.faq}</NavLink>
          </nav>
          <div className="ms-auto flex items-center gap-2">
            <LanguageSwitcher locale={locale} label={t.nav.language} />
            <Button asChild variant="ghost" className="hidden gap-2 md:inline-flex">
              <a href={ROUTES.login}>
                <LogIn aria-hidden />
                {t.nav.login}
              </a>
            </Button>
            <DemoButton locale={locale} className="hidden md:inline-flex" />
            <MobileMenu locale={locale} />
          </div>
        </div>
      </header>

      <main id="contenu">
        {/* Accroche */}
        <section className="relative overflow-hidden bg-gradient-to-b from-app-from to-background">
          <div aria-hidden className="pointer-events-none absolute -top-24 end-[-10%] size-[420px] rounded-full bg-primary/15 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute bottom-0 start-[-10%] size-[320px] rounded-full bg-highlight/15 blur-3xl" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-16 md:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20 lg:pb-24">
            <div className="flex flex-col items-start gap-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/80 px-3 py-1 text-caption font-medium text-primary">
                <Sparkles className="size-3.5" aria-hidden />
                {t.hero.badge}
              </span>
              <h1 className="text-[34px] leading-[1.15] font-semibold tracking-tight text-heading sm:text-5xl sm:leading-[1.1]">
                {t.hero.title} <span className="text-primary">{t.hero.highlight}</span>
              </h1>
              <p className="max-w-xl text-base leading-7 text-foreground sm:text-lg sm:leading-8">{t.hero.subtitle}</p>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <DemoButton locale={locale} label={t.hero.demo} className="h-12 px-6 text-base" />
                <Button asChild variant="outline" className="h-12 gap-2 px-6 text-base">
                  <a href={ROUTES.login}>
                    {t.hero.login}
                    <ArrowRight aria-hidden />
                  </a>
                </Button>
              </div>
              <ul className="flex flex-col gap-2 text-body text-foreground sm:flex-row sm:flex-wrap sm:gap-x-6">
                {t.hero.points.map((point) => (
                  <li key={point} className="flex items-center gap-2">
                    <CircleCheck className="size-4 shrink-0 text-success-ink" aria-hidden />
                    <span dir="auto">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
            <DashboardPreview locale={locale} />
          </div>
        </section>

        {/* Fonctionnalités */}
        <Section id="features" title={t.features.title} subtitle={t.features.subtitle}>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(FEATURE_ICONS) as FeatureKey[]).map((key) => {
              const Icon = FEATURE_ICONS[key];
              const item = t.features.items[key];
              const premium = PREMIUM_FEATURES.includes(key);
              return (
                <li key={key} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    {premium ? (
                      <span className="rounded-full bg-highlight/15 px-2.5 py-0.5 text-caption font-semibold text-[#b45f0e] dark:text-highlight">
                        {t.features.premium}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="text-section text-heading">{item.title}</h3>
                  <p className="text-body text-foreground">{item.text}</p>
                </li>
              );
            })}
          </ul>
        </Section>

        {/* Pour qui */}
        <Section title={t.audiences.title} subtitle={t.audiences.subtitle} muted>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {t.audiences.items.map((item, index) => {
              const Icon = AUDIENCE_ICONS[index] ?? Sparkles;
              return (
                <li key={item.title} className="flex flex-col gap-2 rounded-2xl bg-card p-5 shadow-sm">
                  <Icon className="size-6 text-primary" aria-hidden />
                  <h3 className="text-section text-heading">{item.title}</h3>
                  <p className="text-body text-foreground">{item.text}</p>
                </li>
              );
            })}
          </ul>
        </Section>

        {/* Offres */}
        <Section id="plans" title={t.plans.title} subtitle={t.plans.subtitle}>
          <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
            <PlanCard
              locale={locale}
              name={t.plans.starter.name}
              description={t.plans.starter.description}
              features={t.plans.starter.features}
            />
            <PlanCard
              locale={locale}
              name={t.plans.premium.name}
              description={t.plans.premium.description}
              features={t.plans.premium.features}
              badge={t.plans.premium.badge}
              highlighted
            />
          </div>
        </Section>

        {/* Étapes */}
        <Section title={t.steps.title} muted>
          <ol className="grid gap-4 md:grid-cols-3">
            {t.steps.items.map((step, index) => (
              <li key={step.title} className="flex gap-4 rounded-2xl bg-card p-5 shadow-sm">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground">
                  {index + 1}
                </span>
                <div className="flex flex-col gap-1">
                  <h3 className="text-section text-heading">{step.title}</h3>
                  <p className="text-body text-foreground">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        {/* Questions fréquentes */}
        <Section id="faq" title={t.faq.title}>
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {t.faq.items.map((item) => (
              <details key={item.question} className="group rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-section text-heading marker:hidden [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <Plus className="size-5 shrink-0 text-primary transition-transform group-open:rotate-45" aria-hidden />
                </summary>
                <p className="pt-3 text-body text-foreground">{item.answer}</p>
              </details>
            ))}
          </div>
        </Section>

        {/* Appel à l'action */}
        <section className="px-4 pb-16 md:px-6">
          <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-5 overflow-hidden rounded-3xl bg-primary px-6 py-12 text-center text-primary-foreground sm:px-12">
            <div aria-hidden className="pointer-events-none absolute -top-20 -end-20 size-72 rounded-full bg-white/10 blur-2xl" />
            <h2 className="relative max-w-2xl text-2xl font-semibold sm:text-3xl">{t.cta.title}</h2>
            <p className="relative max-w-xl text-base text-primary-foreground/85">{t.cta.text}</p>
            <DemoButton locale={locale} label={t.cta.button} variant="secondary" className="relative h-12 px-6 text-base" />
          </div>
        </section>
      </main>

      {/* Pied de page */}
      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 md:flex-row md:items-start md:justify-between md:px-6">
          <div className="flex max-w-sm flex-col gap-3">
            <Logo height={24} decorative />
            <p className="text-body text-muted-foreground">{t.footer.tagline}</p>
          </div>
          <ul className="flex flex-col gap-2 text-body">
            <li>
              <a href={ROUTES.login} className="text-heading hover:text-primary">
                {t.footer.staffLogin}
              </a>
            </li>
            <li>
              <a href={ROUTES.student.login} className="text-heading hover:text-primary">
                {t.footer.studentLogin}
              </a>
            </li>
            <li>
              <a
                href={`https://wa.me/${DEMO_WHATSAPP}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-heading hover:text-primary"
              >
                <MessageCircle className="size-4" aria-hidden />
                <span dir="ltr">{t.footer.contact}</span>
              </a>
            </li>
          </ul>
        </div>
        <p className="border-t border-divider px-4 py-4 text-center text-caption text-muted-foreground">
          © {new Date().getFullYear()} dirassty. {t.footer.rights}
        </p>
      </footer>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} className="rounded-lg px-3 py-2 text-body font-medium text-foreground transition-colors hover:bg-muted hover:text-heading">
      {children}
    </a>
  );
}

function Section({
  id,
  title,
  subtitle,
  muted = false,
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn("scroll-mt-20 px-4 py-16 md:px-6 lg:py-20", muted && "bg-muted/60")}>
      <div className="mx-auto flex max-w-6xl flex-col gap-10">
        <div className="mx-auto flex max-w-2xl flex-col gap-3 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-heading sm:text-3xl">{title}</h2>
          {subtitle ? <p className="text-base text-foreground">{subtitle}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}

function PlanCard({
  locale,
  name,
  description,
  features,
  badge,
  highlighted = false,
}: {
  locale: Locale;
  name: string;
  description: string;
  features: string[];
  badge?: string;
  highlighted?: boolean;
}) {
  const t = VITRINE[locale].plans;
  return (
    <div
      className={cn(
        "relative flex flex-col gap-5 rounded-3xl border bg-card p-6 shadow-sm sm:p-8",
        highlighted ? "border-primary ring-4 ring-primary/10" : "border-border",
      )}
    >
      {badge ? (
        <span className="absolute -top-3 start-6 rounded-full bg-primary px-3 py-1 text-caption font-semibold text-primary-foreground">
          {badge}
        </span>
      ) : null}
      <div className="flex flex-col gap-1">
        <h3 className="text-xl font-semibold text-heading">{name}</h3>
        <p className="text-body text-foreground">{description}</p>
      </div>
      <p className="text-2xl font-semibold text-heading">{t.onRequest}</p>
      <ul className="flex flex-col gap-3">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-3 text-body text-foreground">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            {feature}
          </li>
        ))}
      </ul>
      <DemoButton locale={locale} label={t.cta} variant={highlighted ? "default" : "outline"} className="mt-auto h-11" />
    </div>
  );
}

/** Aperçu illustratif du tableau de bord (données fictives). */
function DashboardPreview({ locale }: { locale: Locale }) {
  const t = VITRINE[locale].preview;
  const stats = [
    { label: t.collected, value: t.collectedValue, tone: "text-primary" },
    { label: t.attendance, value: t.attendanceValue, tone: "text-success-ink" },
    { label: t.unpaid, value: t.unpaidValue, tone: "text-[#b45f0e]" },
  ];
  return (
    <figure aria-label={t.label} className="relative mx-auto w-full max-w-lg">
      <div className="rounded-3xl border border-border bg-card p-4 shadow-xl shadow-primary/10 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <GraduationCap className="size-5" aria-hidden />
            </span>
            <span className="font-semibold text-heading">{t.center}</span>
          </div>
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col gap-1 rounded-2xl bg-muted/70 p-3">
              <span className="text-[11px] leading-4 text-muted-foreground sm:text-caption">{stat.label}</span>
              <span className={cn("text-base font-semibold sm:text-lg", stat.tone)} dir="auto">
                {stat.value}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-5 mb-2 text-caption font-semibold text-muted-foreground">{t.recent}</p>
        <ul className="flex flex-col divide-y divide-divider">
          {t.payments.map((payment) => (
            <li key={payment.name} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-body font-medium text-heading">{payment.name}</span>
                <span className="truncate text-caption text-muted-foreground">{payment.detail}</span>
              </div>
              <span className="shrink-0 text-body font-semibold text-heading" dir="auto">
                {payment.amount}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="absolute -bottom-5 start-4 flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 shadow-lg sm:start-8">
        <span className="flex size-7 items-center justify-center rounded-full bg-success/15 text-success-ink">
          <MessageCircle className="size-4" aria-hidden />
        </span>
        <span className="text-caption font-medium text-heading">{t.receiptSent}</span>
        <Check className="size-4 text-success-ink" aria-hidden />
      </div>
    </figure>
  );
}
