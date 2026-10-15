"use client";

import { LoaderCircle } from "lucide-react";
import Link from "@/components/shared/app-link";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { resolveAttendanceConflict } from "@/lib/actions/attendance";
import type { AttendanceConflict } from "@/lib/data/sessions";
import { formatDate, formatDateTime } from "@/lib/format";
import { useLabels, useMessage } from "@/lib/i18n/client";

/**
 * Appels en désaccord (admin) : les deux saisies, la valeur affichée, et le
 * choix du statut à retenir (saisie de l'admin dans l'historique).
 */
export function AttendanceConflicts({ conflicts, fileBase }: { conflicts: AttendanceConflict[]; fileBase: string }) {
  const LABELS = useLabels();
  const message = useMessage();
  const L = LABELS.attendanceConflicts;
  const M = LABELS.attendanceMarkers;
  const [pending, startTransition] = useTransition();

  const keep = (conflictId: string, status: "present" | "absent") =>
    startTransition(async () => {
      const result = await resolveAttendanceConflict({ conflictId, status });
      if (result.ok) toast.success(L.resolved);
      else toast.error(message(result.error));
    });

  return (
    <ul className="flex flex-col divide-y divide-divider">
      {conflicts.map((conflict) => (
        <li key={conflict.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Link href={`${fileBase}/${conflict.studentId}?onglet=absences`} className="truncate font-semibold text-heading hover:text-primary">
              {conflict.studentName}
            </Link>
            <span className="text-caption text-muted-foreground">
              {L.session(`${conflict.subjectName} (${conflict.levelName})`, formatDate(conflict.sessionDate))}
            </span>
            <span className="text-caption">
              {L.entry(M.teacher, conflict.teacher.name ?? LABELS.common.none, LABELS.status[conflict.teacher.status], formatDateTime(conflict.teacher.at))}
            </span>
            <span className="text-caption">
              {L.entry(
                conflict.staff.role ? M[conflict.staff.role] : M.assistant,
                conflict.staff.name ?? LABELS.common.none,
                LABELS.status[conflict.staff.status],
                formatDateTime(conflict.staff.at),
              )}
            </span>
            <span className="text-caption font-medium text-warning-ink">{L.displayed(LABELS.status[conflict.currentStatus])}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:w-80">
            {(["present", "absent"] as const).map((status) => (
              <Button key={status} type="button" variant="outline" disabled={pending} onClick={() => keep(conflict.id, status)}>
                {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
                {L.keep(LABELS.status[status])}
              </Button>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
