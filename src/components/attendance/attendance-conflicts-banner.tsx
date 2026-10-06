import { TriangleAlert } from "lucide-react";
import Link from "@/components/shared/app-link";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/auth/routes";
import type { AppLabels } from "@/lib/constants/labels";

/** Tableau de bord de l'admin : appels en désaccord entre le professeur et l'accueil. */
export function AttendanceConflictsBanner({ count, LABELS }: { count: number; LABELS: AppLabels }) {
  const C = LABELS.attendanceConflicts;
  return (
    <div role="status" className="flex flex-col gap-3 rounded-xl bg-warning/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-ink" aria-hidden />
        {C.banner(count)}
      </p>
      <Button asChild variant="outline" className="min-h-11 self-start sm:self-auto">
        <Link href={`${ROUTES.admin.absences}#desaccords`}>{C.review}</Link>
      </Button>
    </div>
  );
}
