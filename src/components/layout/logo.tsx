import { GraduationCap } from "lucide-react";

import { Logo as DirasstyLogo } from "@/components/brand/logo";
import { LABELS } from "@/lib/constants/labels";
import { cn } from "@/lib/utils";

type LogoProps = {
  /** Marque blanche : nom et logo du centre. */
  name?: string;
  logoUrl?: string | null;
  /** Centre en marque blanche : la marque dirassty n'apparaît pas, même sans logo. */
  whiteLabel?: boolean;
  /** Logo au-dessus de la ligne de flottaison (page de connexion). */
  priority?: boolean;
  className?: string;
};

/** Logo de l'en-tête : celui du centre en marque blanche, sinon dirassty. */
export function Logo({ name = LABELS.app.name, logoUrl = null, whiteLabel = false, priority = false, className }: LogoProps) {
  if (logoUrl) {
    return (
      <span className={cn("inline-flex items-center gap-3", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- logo du client (bucket public) */}
        <img src={logoUrl} alt="" className="h-9 w-auto max-w-[140px] object-contain" />
        <span className="text-base font-semibold tracking-tight">{name}</span>
      </span>
    );
  }
  if (whiteLabel) {
    return (
      <span className={cn("inline-flex items-center gap-3", className)}>
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <GraduationCap className="size-5" aria-hidden />
        </span>
        <span className="text-base font-semibold tracking-tight">{name}</span>
      </span>
    );
  }
  return <DirasstyLogo height={28} priority={priority} className={className} />;
}
