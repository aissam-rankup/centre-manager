"use client";

import { Archive, ArchiveRestore, LoaderCircle, Trash2 } from "lucide-react";
import { type ReactElement, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/actions/result";
import { archiveSubject, deleteSubject, getSubjectDependencies, type SubjectDependencies, unarchiveSubject } from "@/lib/actions/admin";
import { useLabels, useMessage } from "@/lib/i18n/client";

/**
 * Suppression d'une matière : à l'ouverture, ce qui la lie est compté.
 * Sans historique : suppression définitive (liens détachables annoncés) ;
 * avec historique : message clair et archivage proposé (ou ce qui l'empêche).
 */
export function SubjectRemovalButton({ subjectId, name, children }: { subjectId: string; name: string; children: ReactElement }) {
  const LABELS = useLabels();
  const R = LABELS.admin.subjects.removal;
  const message = useMessage();
  const [open, setOpen] = useState(false);
  const [deps, setDeps] = useState<SubjectDependencies | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [pending, startAction] = useTransition();

  const onOpenChange = (value: boolean) => {
    setOpen(value);
    if (!value) return;
    setDeps(null);
    setError(null);
    startLoading(async () => {
      const result = await getSubjectDependencies(subjectId);
      if (result.ok) setDeps(result.data);
      else setError(message(result.error));
    });
  };

  const run = (action: () => Promise<ActionResult<unknown>>, done: string) => {
    setError(null);
    startAction(async () => {
      const result = await action();
      if (!result.ok) {
        setError(message(result.error));
        return;
      }
      toast.success(done);
      setOpen(false);
    });
  };

  const blocking = deps ? deps.activeEnrollments + deps.pastEnrollments + deps.attendance + deps.packs + deps.resources : 0;
  const deletable = deps !== null && blocking === 0;
  const archivable = deps !== null && !deletable && deps.activeEnrollments === 0 && deps.activePacks.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <div className="flex min-w-0 flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="text-section">{deps && !deletable ? R.blockedTitle : R.title(name)}</DialogTitle>
            <DialogDescription>{deps === null ? R.loading : deletable ? R.deletable : R.hasHistory}</DialogDescription>
          </DialogHeader>

          {loading ? (
            <p className="flex items-center gap-2 text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              {R.loading}
            </p>
          ) : null}

          {deps && deletable && deps.teachers + deps.slots + deps.rates + deps.discounts > 0 ? (
            <div className="flex flex-col gap-1 rounded-xl bg-muted px-4 py-3">
              <p className="font-medium">{R.detached}</p>
              <ul className="list-disc ps-5 text-muted-foreground">
                {deps.teachers > 0 ? <li>{R.teachers(deps.teachers)}</li> : null}
                {deps.slots > 0 ? <li>{R.slots(deps.slots)}</li> : null}
                {deps.rates > 0 ? <li>{R.rates(deps.rates)}</li> : null}
                {deps.discounts > 0 ? <li>{R.discounts(deps.discounts)}</li> : null}
              </ul>
            </div>
          ) : null}

          {deps && !deletable ? (
            <>
              <div className="flex flex-col gap-1 rounded-xl bg-muted px-4 py-3">
                <p className="font-medium">{R.blocking}</p>
                <ul className="list-disc ps-5 text-muted-foreground">
                  {deps.activeEnrollments > 0 ? <li>{R.activeEnrollments(deps.activeEnrollments)}</li> : null}
                  {deps.pastEnrollments > 0 ? <li>{R.pastEnrollments(deps.pastEnrollments)}</li> : null}
                  {deps.invoices > 0 ? <li>{R.invoices(deps.invoices)}</li> : null}
                  {deps.attendance > 0 ? <li>{R.attendance(deps.attendance)}</li> : null}
                  {deps.packs > 0 ? <li>{R.packs(deps.packs)}</li> : null}
                  {deps.resources > 0 ? <li>{R.resources(deps.resources)}</li> : null}
                </ul>
              </div>
              {archivable ? (
                <p className="text-muted-foreground">
                  {R.archiveExplain}
                  {deps.slots > 0 ? ` ${R.archiveSlots(deps.slots)}` : ""}
                </p>
              ) : (
                <p className="rounded-xl bg-warning/10 px-4 py-3 font-medium text-warning-ink">
                  {deps.activeEnrollments > 0 ? R.cannotArchiveEnrolled(deps.activeEnrollments) : R.cannotArchivePacks(deps.activePacks.join(", "))}
                </p>
              )}
            </>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 font-medium text-danger-ink">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {LABELS.common.cancel}
            </Button>
            {deletable ? (
              <Button type="button" variant="destructive" disabled={pending} onClick={() => run(() => deleteSubject(subjectId), R.deleted)}>
                {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
                {R.delete}
              </Button>
            ) : null}
            {archivable ? (
              <Button type="button" disabled={pending} onClick={() => run(() => archiveSubject(subjectId), R.archived)}>
                {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Archive aria-hidden />}
                {R.archive}
              </Button>
            ) : null}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Réactivation d'une matière archivée (confirmation). */
export function UnarchiveSubjectButton({ subjectId, name }: { subjectId: string; name: string }) {
  const LABELS = useLabels();
  const L = LABELS.admin.subjects;
  return (
    <ConfirmAction
      variant="default"
      trigger={
        <Button variant="outline" aria-label={`${L.unarchive} — ${name}`}>
          <ArchiveRestore aria-hidden />
          {L.unarchive}
        </Button>
      }
      title={L.unarchiveTitle(name)}
      description={L.unarchiveHint}
      confirmLabel={L.unarchive}
      successMessage={L.unarchived}
      action={() => unarchiveSubject(subjectId)}
    />
  );
}
