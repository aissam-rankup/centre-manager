import { Info, TriangleAlert } from "lucide-react";

import { OTHER_CENTER_PARAM, PLATFORM_ACCOUNT, SESSION_CLOSED_PARAM, TRANSFER_PARAM } from "@/lib/auth/routes";
import { centerAddress, getCenterUrl, getRootUrl, SLUG_PATTERN } from "@/lib/center-host";
import { getLabels } from "@/lib/i18n/server";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Message de l'écran de connexion : session fermée (mot de passe réinitialisé),
 * ou lié à l'adresse : compte d'un autre centre
 * (déconnecté, lien vers l'adresse de son centre) ou transfert depuis le
 * domaine racine (se reconnecter une fois sur l'adresse du centre).
 */
export async function CenterNotice({ params, currentSlug }: { params: SearchParams; currentSlug: string | null }) {
  const LABELS = await getLabels();
  const L = LABELS.centerHost;
  // Session fermée par une réinitialisation du mot de passe.
  if (params[SESSION_CLOSED_PARAM] === "fermee") {
    return (
      <div role="status" className="flex items-start gap-3 rounded-lg bg-primary-soft px-4 py-3 text-foreground">
        <Info className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <p>{LABELS.passwords.sessionClosed}</p>
      </div>
    );
  }
  const other = params[OTHER_CENTER_PARAM];
  if (typeof other === "string" && (other === PLATFORM_ACCOUNT || SLUG_PATTERN.test(other))) {
    const href = other === PLATFORM_ACCOUNT ? getRootUrl("/connexion") : getCenterUrl({ slug: other }, "/connexion");
    const address = other === PLATFORM_ACCOUNT ? getRootUrl().replace(/^https?:\/\//, "") : centerAddress(other);
    return (
      <div role="alert" className="flex items-start gap-3 rounded-lg bg-danger/10 px-4 py-3 text-danger-ink">
        <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
        <p>
          {other === PLATFORM_ACCOUNT ? L.platformAccount : L.wrongCenter}{" "}
          <a href={href} className="font-medium break-all underline underline-offset-4">
            {address}
          </a>
        </p>
      </div>
    );
  }
  if (params[TRANSFER_PARAM] === "1" && currentSlug) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-lg bg-primary-soft px-4 py-3 text-foreground">
        <Info className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <p>
          {L.transferred} <span className="font-medium break-all">{centerAddress(currentSlug)}</span>
        </p>
      </div>
    );
  }
  return null;
}
