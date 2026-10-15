import Image from "next/image";

import { cn } from "@/lib/utils";

/** Rapports largeur / hauteur des viewBox des SVG : l'espace est réservé avant le chargement. */
const RATIO = { full: 345.64 / 86, mark: 66 / 86 } as const;

const SOURCES = {
  full: {
    color: "/brand/logo-dirassty.svg",
    white: "/brand/logo-dirassty-blanc.svg",
    mono: "/brand/logo-dirassty-noir.svg",
  },
  mark: {
    color: "/brand/symbole-dirassty.svg",
    white: "/brand/symbole-dirassty-blanc.svg",
    mono: "/brand/symbole-dirassty-noir.svg",
  },
} as const;

export type LogoVariant = keyof typeof SOURCES;
export type LogoTone = keyof (typeof SOURCES)["full"];

type LogoProps = {
  /** « full » : symbole et mot ; « mark » : symbole seul. */
  variant?: LogoVariant;
  /**
   * « color » : couleurs de la marque (mot blanc en thème sombre) ; « white » : fond violet ou foncé ;
   * « mono » : monochrome, pour l'impression.
   */
  tone?: LogoTone;
  /** Hauteur affichée, en pixels. */
  height?: number;
  /** Logo au-dessus de la ligne de flottaison (page de connexion). */
  priority?: boolean;
  /** Motif décoratif : ignoré des lecteurs d'écran. */
  decorative?: boolean;
  className?: string;
};

/** Logo de la plateforme dirassty. Le logo d'un centre en marque blanche passe par `layout/logo`. */
export function Logo({ variant = "full", tone = "color", height = 32, priority = false, decorative = false, className }: LogoProps) {
  const width = Math.round(height * RATIO[variant]);
  const sources = SOURCES[variant];
  const image = (src: string, extra?: string, hidden = decorative) => (
    <Image
      src={src}
      alt={hidden ? "" : "dirassty"}
      aria-hidden={hidden || undefined}
      width={width}
      height={height}
      priority={priority}
      className={cn("shrink-0", className, extra)}
    />
  );

  // Le mot du logo en couleur est bleu nuit : en thème sombre, on bascule sur la version blanche.
  if (variant === "full" && tone === "color") {
    return (
      <>
        {image(sources.color, "dark:hidden")}
        {image(sources.white, "hidden dark:block", true)}
      </>
    );
  }
  return image(sources[tone]);
}
