import { formatMAD } from "@/lib/format";
import { cn } from "@/lib/utils";

type MoneyProps = {
  amount: number;
  className?: string;
};

/** Montant « 1 200 MAD », chiffres tabulaires, graisse 600. */
export function Money({ amount, className }: MoneyProps) {
  return <span className={cn("numeric whitespace-nowrap", className)}>{formatMAD(amount)}</span>;
}
