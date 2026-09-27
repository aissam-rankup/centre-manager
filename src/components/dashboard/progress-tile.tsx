import Link from "next/link";
import type { ReactNode } from "react";

import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Couleurs des cartes, dans l'ordre ; elles tournent au-delà de 4. */
const TILE_TONES = ["bg-tile-1", "bg-tile-2", "bg-tile-3", "bg-tile-4"] as const;

export function tileTone(index: number): string {
  return TILE_TONES[index % TILE_TONES.length] ?? TILE_TONES[0];
}

/** Couleur stable par matière (ordre des identifiants) : une matière garde sa couleur dans tout l'écran. */
export function subjectTones(subjectIds: readonly string[]): Map<string, string> {
  const unique = [...new Set(subjectIds)].sort();
  return new Map(unique.map((id, index) => [id, tileTone(index)] as const));
}

type ProgressRingProps = {
  /** Valeur entre 0 et 1. */
  value: number;
  caption: string;
  size?: number;
};

/** Anneau de progression : piste blanche à 30 %, arc blanc, pourcentage au centre. */
export function ProgressRing({ value, caption, size = 56 }: ProgressRingProps) {
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, value));
  const label = formatPercent(clamped);

  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeOpacity={0.3} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          className="transition-[stroke-dashoffset] duration-700 ease-(--ease-soft)"
        />
      </svg>
      <span className="absolute flex flex-col items-center leading-none">
        <span className="numeric text-body">{label.replace(/\s?%/, "%")}</span>
        <span className="mt-0.5 text-[8px] font-medium">{caption}</span>
      </span>
      <span className="sr-only">{`${label} ${caption}`}</span>
    </span>
  );
}

type ProgressTileProps = {
  index: number;
  ring?: ReactNode;
  title: string;
  description: string;
  href?: string;
  linkLabel?: string;
  /** Contenu libre sous la description (ex. bouton « Faire l'appel »). */
  children?: ReactNode;
  className?: string;
};

/** Carte colorée : anneau à gauche, titre et détails à droite, deux cercles décoratifs. */
export function ProgressTile({ index, ring, title, description, href, linkLabel, children, className }: ProgressTileProps) {
  return (
    <div
      className={cn(
        "relative flex min-h-[100px] items-center gap-4 overflow-hidden rounded-xl p-4 text-white shadow-card",
        tileTone(index),
        className,
      )}
    >
      <span className="pointer-events-none absolute -top-6 -right-6 size-20 rounded-full bg-white/[0.08]" aria-hidden />
      <span className="pointer-events-none absolute -bottom-5 left-10 size-[50px] rounded-full bg-white/[0.08]" aria-hidden />
      {ring}
      <div className="relative flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="line-clamp-2 text-body font-semibold">{title}</p>
        <p className="text-[10px] leading-4 text-white/85">{description}</p>
        {href && linkLabel ? (
          <Link href={href} className="w-fit rounded-sm text-[10px] leading-4 underline underline-offset-2">
            {linkLabel}
          </Link>
        ) : null}
        {children}
      </div>
    </div>
  );
}
