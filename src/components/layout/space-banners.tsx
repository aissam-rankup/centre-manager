import { LifeBuoy, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { endSupport } from "@/lib/actions/support";
import type { SessionProfile } from "@/lib/auth/session";
import { LABELS } from "@/lib/constants/labels";
import { formatDate, formatTime } from "@/lib/format";

/**
 * Bandeaux de l'espace administration :
 *  - retard de paiement de l'abonnement (administrateur du centre seulement) ;
 *  - mode support du super-admin (permanent, lecture seule).
 */
export function SpaceBanners({ profile }: { profile: SessionProfile }) {
  const pastDue = !profile.support && profile.centerStatus === "past_due" && profile.billing;
  if (!pastDue && !profile.support) return null;

  return (
    <div className="flex flex-col">
      {profile.support ? (
        <div role="status" className="flex flex-wrap items-center gap-3 bg-heading px-4 py-2 text-caption text-white md:px-8">
          <LifeBuoy className="size-4 shrink-0" aria-hidden />
          <p className="flex-1 font-medium">
            {LABELS.supportBanner.message(profile.centerName, formatTime(profile.support.expiresAt))}
          </p>
          <form action={endSupport}>
            <Button type="submit" variant="outline" className="h-8 border-white/40 bg-transparent text-white hover:bg-white/10">
              {LABELS.supportBanner.leave}
            </Button>
          </form>
        </div>
      ) : null}
      {pastDue && profile.billing ? (
        <div role="alert" className="flex items-start gap-3 bg-warning/15 px-4 py-2 text-caption text-warning-ink md:px-8">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="font-medium">
            {LABELS.pastDueBanner.message(profile.billing.daysBeforeSuspension, formatDate(profile.billing.suspensionDate))}{" "}
            <span className="font-normal">{LABELS.pastDueBanner.due(formatDate(profile.billing.dueDate))}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
