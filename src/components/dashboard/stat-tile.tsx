"use client";

import { MoreVertical } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLabels } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export type StatTileLink = { href: string; label: string };

type StatTileProps = {
  value: ReactNode;
  label: string;
  /** Précision sous le libellé (ex. « 33 % des 27 600 MAD attendus »). */
  detail?: string;
  /** Liens du menu « trois points » : uniquement des actions réelles. */
  links?: StatTileLink[];
  /** Carte entièrement cliquable (ex. vers la liste des absents). */
  href?: string;
  className?: string;
};

/** Carte de statistique : grand chiffre violet, libellé gris, menu d'actions. */
export function StatTile({ value, label, detail, links = [], href, className }: StatTileProps) {
  const LABELS = useLabels();
  return (
    <div
      className={cn(
        "relative flex flex-col gap-1 rounded-xl bg-card px-6 py-5 shadow-card",
        href && "card-interactive",
        className,
      )}
    >
      <p className="numeric pr-8 text-stat text-primary">{value}</p>
      {href ? (
        // Le lien couvre toute la carte ; le menu reste cliquable au-dessus.
        <Link href={href} className="text-caption text-muted-foreground after:absolute after:inset-0 after:rounded-xl">
          {label}
        </Link>
      ) : (
        <p className="text-caption text-muted-foreground">{label}</p>
      )}
      {detail ? <p className="text-caption text-subtle">{detail}</p> : null}

      {links.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 right-2 z-10 size-8 text-subtle"
              aria-label={LABELS.dashboard.moreActions(label)}
            >
              <MoreVertical className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {links.map((link) => (
              <DropdownMenuItem key={link.href} asChild className="min-h-10">
                <Link href={link.href}>{link.label}</Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

/**
 * Rangée de cartes : grille de 3 à partir de 768 px ; en dessous, carrousel
 * horizontal (scroll-snap), chaque carte à 80 % de la largeur.
 */
export function StatTiles({ children }: { children: ReactNode }) {
  return (
    <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pt-1 pb-4 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pt-0 md:pb-0 [&>*]:w-[80%] [&>*]:shrink-0 [&>*]:snap-start md:[&>*]:w-auto">
      {children}
    </div>
  );
}
