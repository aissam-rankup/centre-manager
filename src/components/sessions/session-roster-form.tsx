"use client";

import { CheckCheck, LoaderCircle, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { StudentAvatar } from "@/components/shared/student-avatar";
import { Button } from "@/components/ui/button";
import { markSessionAttendance } from "@/lib/actions/attendance";
import type { RosterStudent } from "@/lib/data/sessions";
import { formatDateTime } from "@/lib/format";
import { useLabels, useMessage } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type Status = "present" | "absent";

/**
 * Appel d'une séance par l'accueil : présent ou absent pour chaque élève.
 * Seuls les statuts choisis sont envoyés ; chaque saisie garde son auteur.
 */
export function SessionRosterForm({
  slotId,
  date,
  students,
  backHref,
}: {
  slotId: string;
  date: string;
  students: RosterStudent[];
  backHref: string;
}) {
  const LABELS = useLabels();
  const message = useMessage();
  const L = LABELS.sessions.roster;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [statuses, setStatuses] = useState<Record<string, Status | null>>(() =>
    Object.fromEntries(students.map((student) => [student.id, student.status])),
  );

  const set = (studentId: string, status: Status) => setStatuses((current) => ({ ...current, [studentId]: status }));
  const unmarked = students.filter((student) => !statuses[student.id]).length;

  const save = () => {
    const entries = students.flatMap((student) => {
      const status = statuses[student.id];
      return status ? [{ studentId: student.id, status }] : [];
    });
    if (entries.length === 0) {
      toast.error(L.nothingToSave);
      return;
    }
    startTransition(async () => {
      const result = await markSessionAttendance({ slotId, date, entries });
      if (!result.ok) {
        toast.error(message(result.error));
        return;
      }
      toast.success(L.saved(entries.length));
      router.push(backHref);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-caption text-muted-foreground">{unmarked > 0 ? L.unmarked(unmarked) : null}</p>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => setStatuses(Object.fromEntries(students.map((student) => [student.id, "present" as const])))}
        >
          <CheckCheck aria-hidden />
          {L.allPresent}
        </Button>
      </div>

      <ul className="flex flex-col divide-y divide-divider rounded-xl bg-card shadow-card">
        {students.map((student) => {
          const status = statuses[student.id];
          return (
            <li key={student.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <StudentAvatar
                  name={student.fullName}
                  photoUrl={student.photoUrl}
                  status={status === "absent" ? "overdue" : status === "present" ? "upToDate" : "neutral"}
                />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-heading">{student.fullName}</span>
                  <span className="truncate text-caption text-subtle">
                    {student.markedByName && student.markedByRole && student.markedAt
                      ? L.markedBy(LABELS.attendanceMarkers[student.markedByRole], student.markedByName, formatDateTime(student.markedAt))
                      : L.notMarked}
                  </span>
                </div>
              </div>
              <div role="radiogroup" aria-label={student.fullName} className="grid grid-cols-2 gap-2 sm:w-64">
                {(["present", "absent"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={status === value}
                    disabled={pending}
                    onClick={() => set(student.id, value)}
                    className={cn(
                      "min-h-11 rounded-lg border px-3 text-body font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60",
                      status === value
                        ? value === "present"
                          ? "border-success bg-success/15 text-success-ink"
                          : "border-danger bg-danger/10 text-danger-ink"
                        : "hover:bg-muted",
                    )}
                  >
                    {value === "present" ? L.present : L.absent}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      <Button type="button" className="self-end" disabled={pending} onClick={save}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Save aria-hidden />}
        {pending ? L.saving : L.save}
      </Button>
    </div>
  );
}
