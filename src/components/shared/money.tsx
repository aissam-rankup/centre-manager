import { formatMAD, formatMADLong } from "@/lib/format";
import { cn } from "@/lib/utils";

type MoneyProps = {
  amount: number;
  /** « long » affiche la devise en toutes lettres. */
  variant?: "code" | "long";
  className?: string;
};

/** Montant en dirhams, toujours en chiffres tabulaires. */
export function Money({ amount, variant = "code", className }: MoneyProps) {
  return (
    <span className={cn("numeric whitespace-nowrap", className)}>
      {variant === "long" ? formatMADLong(amount) : formatMAD(amount)}
    </span>
  );
}
