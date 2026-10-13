"use client";

import { PauseCircle, PlayCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormDialog } from "@/components/admin/form-dialog";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reactivateStudent, suspendStudent } from "@/lib/actions/student-suspension";
import type { StudentFile } from "@/lib/data/assistant";
import { formatDate } from "@/lib/format";
import { useLabels, useMessage } from "@/lib/i18n/client";

type StudentSuspensionProps = {
  studentId: string;
  studentName: string;
  suspension: StudentFile["suspension"];
  /** Mode support : consultation seule. */
  readOnly?: boolean;
};

/**
 * Suspension de l'élève (admin et assistant) : encart d'avertissement et
 * « Réactiver » s'il est suspendu ; sinon bouton « Suspendre l'élève » (motif).
 */
export function StudentSuspension({ studentId, studentName, suspension, readOnly = false }: StudentSuspensionProps) {
  const LABELS = useLabels();
  const S = LABELS.assistant.student.suspension;

  if (suspension) {
    return (
      <section
        aria-label={S.title}
        className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <p className="flex items-center gap-2 font-semibold text-warning-ink">
            <PauseCircle className="size-5 shrink-0" aria-hidden />
            {S.title}
          </p>
          <p className="text-caption text-muted-foreground">{S.since(formatDate(suspension.at), suspension.byName)}</p>
          <p>
            <span className="font-medium">{S.reason} : </span>
            {suspension.reason}
          </p>
          <p className="text-caption text-muted-foreground">{S.effects}</p>
        </div>
        {readOnly ? null : (
          <ConfirmAction
            variant="default"
            trigger={
              <Button className="shrink-0">
                <PlayCircle aria-hidden />
                {S.reactivate}
              </Button>
            }
            title={S.reactivateTitle(studentName)}
            description={S.reactivateDescription}
            confirmLabel={S.reactivate}
            successMessage={S.reactivated}
            action={() => reactivateStudent(studentId)}
          />
        )}
      </section>
    );
  }

  return readOnly ? null : <SuspendDialog studentId={studentId} studentName={studentName} />;
}

function SuspendDialog({ studentId, studentName }: { studentId: string; studentName: string }) {
  const LABELS = useLabels();
  const S = LABELS.assistant.student.suspension;
  const message = useMessage();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <FormDialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setReason("");
          setError(null);
        }
      }}
      title={S.suspendTitle(studentName)}
      description={S.suspendDescription}
      pending={pending}
      error={error}
      submitLabel={S.confirm}
      onSubmit={(event) => {
        event.preventDefault();
        if (!reason.trim()) {
          setError(S.reasonRequired);
          return;
        }
        startTransition(async () => {
          const result = await suspendStudent({ studentId, reason });
          if (!result.ok) {
            setError(message(result.error));
            return;
          }
          toast.success(S.done);
          setOpen(false);
        });
      }}
      trigger={
        <Button variant="outline" className="self-start text-warning-ink">
          <PauseCircle aria-hidden />
          {S.suspend}
        </Button>
      }
    >
      <FormField id={`suspension-${studentId}`} label={S.reasonLabel}>
        <Input maxLength={200} value={reason} placeholder={S.reasonPlaceholder} onChange={(event) => setReason(event.target.value)} />
      </FormField>
    </FormDialog>
  );
}
