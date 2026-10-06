import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * Lien interne sans préchargement automatique par défaut. Next.js précharge
 * chaque lien visible (une liste de 20 élèves = 20 requêtes) : derrière le
 * Worker Cloudflare, tout ce trafic arrive chez l'hébergeur depuis quelques
 * adresses seulement et déclenche sa limite de requêtes (erreur 429). La page
 * se charge au clic ; `prefetch` reste réglable lien par lien.
 */
export default function Link({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
