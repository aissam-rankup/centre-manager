"use client";

import { Download, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/auth/routes";
import { useLabels } from "@/lib/i18n/client";

/**
 * Ouvrir ou télécharger le fichier d'une ressource (URL signée servie par le
 * serveur). L'ouverture est notée : la page est relue pour retirer « Nouveau ».
 */
export function ResourceLinks({ id, title }: { id: string; title: string }) {
  const LABELS = useLabels();
  const L = LABELS.studentSpace;
  const router = useRouter();
  const refreshSoon = () => window.setTimeout(() => router.refresh(), 1500);

  return (
    <div className="grid grid-cols-2 gap-2 sm:flex">
      <Button asChild>
        <a href={ROUTES.resourceFile(id)} target="_blank" rel="noopener" onClick={refreshSoon} aria-label={`${L.open} : ${title}`}>
          <ExternalLink aria-hidden />
          {L.open}
        </a>
      </Button>
      <Button asChild variant="outline">
        <a href={`${ROUTES.resourceFile(id)}?telecharger=1`} onClick={refreshSoon} aria-label={`${L.download} : ${title}`}>
          <Download aria-hidden />
          {L.download}
        </a>
      </Button>
    </div>
  );
}
