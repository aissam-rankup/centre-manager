"use client";

import { formatMAD } from "@/lib/format";
import { useLocale } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type MoneyProps = {
  amount: number;
  className?: string;
  /** Toujours deux décimales (« 12 500,00 MAD »). */
  cents?: boolean;
};

/** Montant « 1 200 MAD » (« 1.200 درهم » en arabe), chiffres tabulaires, graisse 600. */
export function Money({ amount, className, cents }: MoneyProps) {
  const locale = useLocale();
  return <span className={cn("numeric whitespace-nowrap", className)}>{formatMAD(amount, locale, { cents })}</span>;
}
