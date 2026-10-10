"use client";

import { KeyRound, LoaderCircle, RotateCcw, UserCheck, UserX } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ResetPasswordDialog } from "@/components/password/reset-password-dialog";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { SectionCard } from "@/components/shared/section-card";
import { type ShownCredentials, StudentCredentialsDialog } from "@/components/students/student-credentials-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/actions/result";
import { openStudentAccess, setStudentAccess } from "@/lib/actions/student-access";
import type { StudentAccess } from "@/lib/data/student-access";
import { formatDate, formatDateTime } from "@/lib/format";
import { useLabels, useMessage } from "@/lib/i18n/client";
import { formatLoginCode } from "@/lib/student-codes";

/**
 * Accès élève sur la fiche : ouverture (identifiants affichés une fois),
 * nouveau mot de passe, désactivation en un clic et réactivation.
 */
export function StudentAccessCard({
  studentId,
  studentName,
  guardianPhone,
  access,
  readOnly,
}: {
  studentId: string;
  studentName: string;
  guardianPhone: string | null;
  access: StudentAccess;
  /** Mode support : consultation seule. */
  readOnly: boolean;
}) {
  const LABELS = useLabels();
  const L = LABELS.studentAccess;
  const message = useMessage();
  const [shown, setShown] = useState<ShownCredentials | null>(null);
  const [pending, startTransition] = useTransition();

  const withCredentials = (action: () => Promise<ActionResult<ShownCredentials>>, successMessage: string) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(message(result.error));
        return;
      }
      toast.success(successMessage);
      setShown(result.data);
    });

  return (
    <SectionCard
      title={L.title}
      description={L.description}
      aside={
        access.status === "none" ? null : (
          <Badge variant={access.status === "active" ? "default" : "outline"}>{access.status === "active" ? L.active : L.inactive}</Badge>
        )
      }
    >
      {access.status === "none" ? (
        <p className="text-muted-foreground">{L.none}</p>
      ) : (
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col">
            <dt className="text-caption text-muted-foreground">{L.code}</dt>
            <dd className="numeric text-section tracking-wider text-heading">{access.code ? formatLoginCode(access.code) : "—"}</dd>
          </div>
          <div className="flex flex-col justify-end text-caption text-muted-foreground">
            {access.createdAt ? <span>{L.openedOn(formatDate(access.createdAt))}</span> : null}
            {access.status === "inactive" && access.deactivatedAt ? <span>{L.disabledOn(formatDate(access.deactivatedAt))}</span> : null}
            {access.lastPasswordReset ? (
              <span>{LABELS.passwords.lastReset(formatDateTime(access.lastPasswordReset.at), access.lastPasswordReset.by)}</span>
            ) : null}
          </div>
        </dl>
      )}

      {readOnly ? null : (
        <div className="flex flex-wrap gap-2">
          {access.status === "none" ? (
            <Button
              type="button"
              disabled={pending}
              onClick={() => withCredentials(() => openStudentAccess({ studentId }), L.opened)}
            >
              {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <KeyRound aria-hidden />}
              {L.open}
            </Button>
          ) : null}
          {access.status === "active" ? (
            <>
              <ResetPasswordDialog
                target={{ studentId }}
                name={studentName}
                trigger={
                  <Button type="button" variant="outline" disabled={pending}>
                    <RotateCcw aria-hidden />
                    {LABELS.passwords.reset}
                  </Button>
                }
              />
              <ConfirmAction
                trigger={
                  <Button type="button" variant="outline" className="text-danger-ink">
                    <UserX aria-hidden />
                    {L.disable}
                  </Button>
                }
                title={L.disableTitle}
                description={L.disableDescription}
                confirmLabel={L.disable}
                successMessage={L.disabled}
                action={() => setStudentAccess({ studentId, active: false })}
              />
            </>
          ) : null}
          {access.status === "inactive" ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await setStudentAccess({ studentId, active: true });
                  if (result.ok) toast.success(L.enabled);
                  else toast.error(message(result.error));
                })
              }
            >
              {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <UserCheck aria-hidden />}
              {L.enable}
            </Button>
          ) : null}
        </div>
      )}

      <StudentCredentialsDialog credentials={shown} studentName={studentName} guardianPhone={guardianPhone} onClose={() => setShown(null)} />
    </SectionCard>
  );
}
