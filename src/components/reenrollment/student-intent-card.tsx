"use client";

import { LoaderCircle, TriangleAlert, UserRound } from "lucide-react";
import Link from "next/link";
import { useId, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { Money } from "@/components/shared/money";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { setReenrollmentIntent } from "@/lib/actions/reenrollment";
import { formatDate, formatDateTime, formatMAD, formatPercent } from "@/lib/format";
import { useLabels } from "@/lib/i18n/client";
import { isLeaving, type ReenrollmentIntent, type ReviewStudent } from "@/lib/reenrollment";
import { cn } from "@/lib/utils";

type Decision = { intent: ReenrollmentIntent; dropped: readonly string[] };

const CHOICES = ["confirmed", "dropped", "paused"] as const;

type StudentIntentCardProps = {
  runId: string;
  student: ReviewStudent;
  editable: boolean;
  /** Campagne confirmée : statut de chaque facture émise. */
  issued: boolean;
  /** Mois sans cours : rien n'est facturé. */
  cancelled: boolean;
  fileHref: string;
};

/** Un élève dans la revue : lignes du mois, risques, intention (reconduit, abandonne, en pause). */
export function StudentIntentCard({ runId, student, editable, issued, cancelled, fileHref }: StudentIntentCardProps) {
  const LABELS = useLabels();
  const R = LABELS.reenrollment.review;
  const [pending, startTransition] = useTransition();
  const [leaveChoice, setLeaveChoice] = useState<"dropped" | "paused" | null>(null);
  const [reason, setReason] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  // Nom de groupe propre à cette carte (la page peut rester montée deux fois).
  const radioName = `intention-${useId()}`;

  const saved: Decision = {
    intent: student.intent,
    dropped: student.lines.filter((line) => !line.kept && !isLeaving(student.intent)).map((line) => line.sourceId),
  };
  const [decision, setOptimistic] = useOptimistic(saved, (_current, next: Decision) => next);
  const leaving = isLeaving(decision.intent);
  const keptCount = student.lines.filter((line) => !decision.dropped.includes(line.sourceId)).length;
  const netKept = leaving
    ? 0
    : student.lines.filter((line) => !decision.dropped.includes(line.sourceId)).reduce((sum, line) => sum + line.amountDue, 0);

  const save = (next: Decision, nextReason?: string, onDone?: () => void) => {
    if (pending) return;
    startTransition(async () => {
      setOptimistic(next);
      const result = await setReenrollmentIntent({
        runId,
        studentId: student.studentId,
        intent: next.intent,
        droppedSources: next.intent === "confirmed" ? [...next.dropped] : [],
        reason: nextReason,
      });
      if (!result.ok) {
        if (onDone) setDialogError(result.error);
        else toast.error(result.error);
        return;
      }
      onDone?.();
    });
  };

  return (
    <li
      id={`eleve-${student.studentId}`}
      className={cn("flex scroll-mt-24 flex-col gap-4 rounded-xl bg-card p-5 shadow-card", student.atRisk && "ring-1 ring-warning/60")}
    >
      <div className="flex items-start gap-3">
        <StudentAvatar name={student.fullName} photoUrl={student.photoUrl} status={student.overdueAmount > 0 ? "overdue" : "neutral"} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Link href={fileHref} className="truncate rounded-sm font-semibold text-heading hover:text-primary">
            {student.fullName}
          </Link>
          <span className="truncate text-caption text-muted-foreground">{student.levelName ?? LABELS.common.none}</span>
          {student.atRisk ? (
            <span className="flex flex-wrap gap-x-3 gap-y-1 text-caption font-medium text-warning-ink">
              {student.overdueAmount > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <TriangleAlert className="size-3.5" aria-hidden />
                  {R.risk.overdue(formatMAD(student.overdueAmount))}
                </span>
              ) : null}
              {student.lowAttendance && student.attendanceRate !== null ? (
                <span className="inline-flex items-center gap-1">
                  <TriangleAlert className="size-3.5" aria-hidden />
                  {R.risk.attendance(formatPercent(student.attendanceRate))}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
        <Button asChild variant="ghost" size="icon" className="size-11" aria-label={`${R.openFile} — ${student.fullName}`}>
          <Link href={fileHref}>
            <UserRound aria-hidden />
          </Link>
        </Button>
      </div>

      {student.lines.length === 0 ? (
        <p className="text-caption text-muted-foreground">{R.noLine}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-divider border-y border-divider">
          {student.lines.map((line) => {
            const kept = !cancelled && !leaving && !decision.dropped.includes(line.sourceId);
            const lastKept = kept && keptCount <= 1;
            const selectable = editable && !leaving;
            const Row = selectable ? "label" : "div";
            return (
              <li key={line.lineId}>
                <Row className={cn("flex min-h-11 items-center gap-3 py-2", selectable && !lastKept && "cursor-pointer")}>
                  {selectable ? (
                    <Checkbox
                      checked={kept}
                      disabled={lastKept}
                      aria-disabled={pending || undefined}
                      aria-label={R.keepLine(line.name)}
                      onCheckedChange={(checked) => {
                        const dropped = checked === true
                          ? decision.dropped.filter((id) => id !== line.sourceId)
                          : [...decision.dropped, line.sourceId];
                        save({ intent: "confirmed", dropped });
                      }}
                      className="size-5"
                    />
                  ) : null}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className={cn("truncate font-medium", !kept && "text-muted-foreground", !kept && !cancelled && "line-through")}>
                      {line.name}
                      {line.kind === "pack" ? <span className="ml-2 text-caption font-normal text-muted-foreground">{R.pack}</span> : null}
                    </span>
                    <span className="text-caption text-muted-foreground">
                      {cancelled ? null : kept ? R.due(formatDate(line.dueDate)) : R.lineRemoved}
                      {kept && line.discountAmount > 0 ? ` · ${R.full} ${formatMAD(line.amountFull)} − ${formatMAD(line.discountAmount)}` : null}
                    </span>
                    {line.discountConflict && kept ? <span className="text-caption text-warning-ink">{R.conflict}</span> : null}
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <Money amount={line.amountDue} className={cn(!kept && "text-muted-foreground", !kept && !cancelled && "line-through")} />
                    {issued && line.invoiceStatus ? (
                      <span
                        className={cn(
                          "text-caption font-medium",
                          line.invoiceStatus === "paid" ? "text-success-ink" : line.invoiceStatus === "overdue" ? "text-danger-ink" : "text-muted-foreground",
                        )}
                      >
                        {R.invoiceStatus[line.invoiceStatus]}
                      </span>
                    ) : null}
                  </div>
                </Row>
              </li>
            );
          })}
        </ul>
      )}

      {cancelled ? null : (
        <div className="flex items-center justify-between gap-3">
          <span className="text-caption text-muted-foreground">{R.net}</span>
          <Money amount={netKept} className="text-lg" />
        </div>
      )}

      {editable ? (
        <fieldset className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          <legend className="sr-only">{R.intentLabel(student.fullName)}</legend>
          {CHOICES.map((choice) => {
            const selected = decision.intent === choice;
            return (
              <label
                key={choice}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center justify-center rounded-md px-2 text-center text-caption font-medium transition-colors",
                  "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  selected ? "bg-card text-heading shadow-card" : "text-muted-foreground hover:text-heading",
                  pending && "opacity-60",
                )}
              >
                <input
                  type="radio"
                  name={radioName}
                  value={choice}
                  checked={selected}
                  aria-disabled={pending || undefined}
                  onChange={() => {
                    if (pending || selected) return;
                    if (choice === "confirmed") {
                      save({ intent: "confirmed", dropped: leaving ? [] : decision.dropped });
                      return;
                    }
                    setReason(student.reason ?? "");
                    setDialogError(null);
                    setLeaveChoice(choice);
                  }}
                  className="sr-only"
                />
                {R.intent[choice]}
              </label>
            );
          })}
        </fieldset>
      ) : (
        <p className="font-medium">{R.intent[decision.intent]}</p>
      )}

      <div className="flex flex-col gap-1 text-caption text-muted-foreground">
        {decision.intent === "pending" ? <span>{R.intent.pending}</span> : null}
        {leaving ? <span>{student.appliedAt ? R.applied : R.leavingNote}</span> : null}
        {student.reason && student.intent !== "pending" ? <span>{R.reasonShown(student.reason)}</span> : null}
        {student.decidedAt && student.intent !== "pending" ? (
          <span>{R.decided(formatDateTime(student.decidedAt), student.decidedByName)}</span>
        ) : null}
        {pending ? (
          <span className="inline-flex items-center gap-1">
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            {LABELS.common.loading}
          </span>
        ) : null}
      </div>

      <Dialog open={leaveChoice !== null} onOpenChange={(open) => (open ? null : setLeaveChoice(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-section">
              {leaveChoice === "paused" ? R.leaveDialog.paused(student.fullName) : R.leaveDialog.dropped(student.fullName)}
            </DialogTitle>
            <DialogDescription>{R.leaveDialog.description}</DialogDescription>
          </DialogHeader>
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!leaveChoice) return;
              setDialogError(null);
              save({ intent: leaveChoice, dropped: [] }, reason, () => {
                toast.success(R.saved);
                setLeaveChoice(null);
              });
            }}
          >
            <label className="flex flex-col gap-2">
              <span className="font-medium">{R.leaveDialog.reason}</span>
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={R.leaveDialog.reasonPlaceholder}
                maxLength={300}
                rows={3}
              />
            </label>
            {dialogError ? (
              <p role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-danger-ink">
                {dialogError}
              </p>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={pending}>
                  {LABELS.common.cancel}
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
                {R.leaveDialog.submit}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </li>
  );
}
