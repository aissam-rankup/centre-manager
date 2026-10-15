"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { SlotConflictPanel } from "@/components/planning/slot-conflict-panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { abandonSlotConflicts, saveSlot } from "@/lib/actions/admin";
import type { PlanningData, PlanningSlot } from "@/lib/data/admin";
import { useLabels, useMessage } from "@/lib/i18n/client";
import type { SlotConflictReport } from "@/lib/schedule-conflicts";

/** Ce qu'un déplacement peut changer. */
export type SlotChanges = Partial<{ dayOfWeek: number; startTime: string; endTime: string; roomId: string; teacherId: string }>;

type SlotValues = {
  id: string;
  subjectId: string;
  teacherId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  roomId: string;
  conflictLogIds: string[];
};

/** Position affichée pendant l'enregistrement (avant la réponse du serveur). */
export type PendingMove = Pick<SlotValues, "dayOfWeek" | "startTime" | "endTime" | "roomId" | "teacherId">;

/**
 * Déplacement d'un cours (glisser-déposer, salle libre proposée) : même Server Action
 * que le formulaire, donc même contrôle des conflits ; en cas de refus, le même panneau
 * explicatif, avec ses propositions applicables en un clic.
 */
export function useSlotMove(data: PlanningData) {
  const LABELS = useLabels();
  const L = LABELS.admin.planning;
  const message = useMessage();
  const [pending, setPending] = useState<Record<string, PendingMove>>({});
  const [conflict, setConflict] = useState<{ slot: PlanningSlot; values: SlotValues; report: SlotConflictReport } | null>(null);
  const [busy, startTransition] = useTransition();

  const describe = (values: SlotValues) =>
    L.grid.where(
      LABELS.days[values.dayOfWeek] ?? "",
      LABELS.teacher.schedule.time(values.startTime, values.endTime),
      data.rooms.find((room) => room.id === values.roomId)?.name ?? "",
    );

  const submit = (slot: PlanningSlot, values: SlotValues, resolving: boolean) =>
    startTransition(async () => {
      setPending((current) => ({ ...current, [slot.id]: values }));
      const result = await saveSlot(values);
      setPending((current) => {
        const next = { ...current };
        delete next[slot.id];
        return next;
      });
      if (result.ok) {
        setConflict(null);
        toast.success(resolving ? L.conflict.resolved : L.grid.moved(slot.subjectName, describe(values)));
        return;
      }
      if (result.conflict) {
        const report = result.conflict;
        // Les conflits successifs restent liés : l'issue finale les clôt tous.
        setConflict({ slot, values: { ...values, conflictLogIds: [...values.conflictLogIds, ...report.logIds].slice(-20) }, report });
        return;
      }
      setConflict(null);
      toast.error(message(result.error));
    });

  const move = (slot: PlanningSlot, changes: SlotChanges) => {
    const values: SlotValues = {
      id: slot.id,
      subjectId: slot.subjectId,
      teacherId: slot.teacherId,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      roomId: slot.roomId,
      conflictLogIds: [],
      ...changes,
    };
    const unchanged =
      values.dayOfWeek === slot.dayOfWeek &&
      values.startTime === slot.startTime &&
      values.endTime === slot.endTime &&
      values.roomId === slot.roomId &&
      values.teacherId === slot.teacherId;
    if (!unchanged) submit(slot, values, false);
  };

  const close = () => {
    // Déplacement abandonné : les conflits signalés sont clos comme tels.
    if (conflict && conflict.values.conflictLogIds.length > 0) void abandonSlotConflicts(conflict.values.conflictLogIds);
    setConflict(null);
  };

  const dialog = (
    <Dialog open={conflict !== null} onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {conflict ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-section">{L.grid.moveTitle(conflict.slot.subjectName, conflict.slot.levelName)}</DialogTitle>
              <DialogDescription>{L.grid.moveAttempt(describe(conflict.values))}</DialogDescription>
            </DialogHeader>
            <SlotConflictPanel
              report={conflict.report}
              pending={busy}
              onApplyRoom={(room) => submit(conflict.slot, { ...conflict.values, roomId: room.roomId }, true)}
              onApplyTime={(time) =>
                submit(
                  conflict.slot,
                  { ...conflict.values, dayOfWeek: time.dayOfWeek, startTime: time.startTime, endTime: time.endTime, roomId: time.roomId },
                  true,
                )
              }
            />
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={close}>
                {L.grid.cancelMove}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );

  return { move, pending, busy, dialog };
}
