"use client";

import { LoaderCircle, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormDialog } from "@/components/admin/form-dialog";
import { useActionForm } from "@/components/admin/use-action-form";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { FormField } from "@/components/shared/form-field";
import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  addEnrollment,
  deleteStudent,
  subscribePack,
  updateEnrollment,
  updatePackSubscription,
  updateStudent,
} from "@/lib/actions/admin";
import { ROUTES } from "@/lib/auth/routes";
import { LABELS } from "@/lib/constants/labels";
import type { LevelOption } from "@/lib/data/admin";
import type { LevelWithSubjects, StudentEnrollment, StudentFile, StudentPackSubscription } from "@/lib/data/assistant";
import { formatMAD } from "@/lib/format";
import { cn } from "@/lib/utils";
import { studentUpdateSchema } from "@/lib/validation/admin";

const L = LABELS.admin.students;
const F = LABELS.assistant.newStudent.fields;

// ---------------------------------------------------------------------
// Modifier / supprimer l'élève
// ---------------------------------------------------------------------
export function StudentAdminActions({ student, levels }: { student: StudentFile; levels: LevelOption[] }) {
  const router = useRouter();
  const { form, open, onOpenChange, onSubmit, pending, error } = useActionForm({
    schema: studentUpdateSchema,
    defaultValues: {
      id: student.id,
      fullName: student.fullName,
      levelId: student.levelId,
      guardianName: student.guardianName ?? "",
      guardianPhone: student.guardianPhone ?? "",
      notes: student.notes ?? "",
    },
    action: updateStudent,
    successMessage: LABELS.admin.common.saved,
  });
  const errors = form.formState.errors;

  return (
    <div className="flex flex-wrap gap-2">
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={L.edit}
        pending={pending}
        error={error}
        onSubmit={onSubmit}
        trigger={
          <Button variant="outline">
            <Pencil aria-hidden />
            {LABELS.admin.common.edit}
          </Button>
        }
      >
        <FormField id="eleve-nom" label={F.fullName} error={errors.fullName?.message}>
          <Input {...form.register("fullName")} />
        </FormField>
        <FormField id="eleve-niveau" label={F.level} error={errors.levelId?.message}>
          <NativeSelect {...form.register("levelId")}>
            {levels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="eleve-responsable" label={F.guardianName} error={errors.guardianName?.message}>
          <Input {...form.register("guardianName")} />
        </FormField>
        <FormField id="eleve-tel" label={F.guardianPhone} error={errors.guardianPhone?.message}>
          <Input type="tel" inputMode="tel" {...form.register("guardianPhone")} />
        </FormField>
        <FormField id="eleve-notes" label={F.notes} error={errors.notes?.message}>
          <Textarea rows={3} {...form.register("notes")} />
        </FormField>
      </FormDialog>

      <ConfirmAction
        trigger={
          <Button variant="destructive">
            <Trash2 aria-hidden />
            {LABELS.admin.common.delete}
          </Button>
        }
        title={L.deleteConfirm(student.fullName)}
        description={`${L.deleteHint} ${LABELS.admin.common.irreversible}`}
        confirmLabel={L.delete}
        successMessage={L.deleted}
        action={() => deleteStudent(student.id)}
        onDone={() => router.push(ROUTES.admin.students)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------
// Inscriptions : prix convenu, arrêt / reprise, ajout, packs
// ---------------------------------------------------------------------
type EnrollmentsEditorProps = {
  studentId: string;
  enrollments: StudentEnrollment[];
  packSubscriptions: StudentPackSubscription[];
  levelSubjects: LevelWithSubjects["subjects"];
  levelPacks: LevelWithSubjects["packs"];
};

export function EnrollmentsEditor({
  studentId,
  enrollments,
  packSubscriptions,
  levelSubjects,
  levelPacks,
}: EnrollmentsEditorProps) {
  const E = L.enrollments;
  const standalone = enrollments.filter((enrollment) => !enrollment.packEnrollmentId);
  const covered = enrollments.filter((enrollment) => enrollment.packEnrollmentId && enrollment.active);
  const activePack = packSubscriptions.find((pack) => pack.active) ?? null;
  const hasActiveStandalone = standalone.some((enrollment) => enrollment.active);
  // Une matière déjà suivie à l'unité (même arrêtée) se reprend via « Reprendre » : pas de seconde inscription.
  const enrolledSubjectIds = new Set(standalone.map((e) => e.subjectId));
  const available = levelSubjects.filter((subject) => !enrolledSubjectIds.has(subject.id));
  const packNames = new Map(packSubscriptions.map((pack) => [pack.id, pack.packName]));
  // Un pack déjà souscrit (même arrêté) se reprend via « Reprendre ».
  const subscribedPackIds = new Set(packSubscriptions.map((pack) => pack.packId));
  const availablePacks = levelPacks.filter((pack) => !subscribedPackIds.has(pack.id));

  return (
    <SectionCard id="inscriptions" title={E.title} description={E.description}>
      <ul className="flex flex-col divide-y">
        {packSubscriptions.map((pack) => (
          <PackRow key={pack.id} subscription={pack} />
        ))}
        {covered.map((enrollment) => (
          <li key={enrollment.id} className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
            <span className="font-medium">{enrollment.subjectName}</span>
            <span className="text-caption text-muted-foreground">
              {LABELS.packs.coveredByPack(packNames.get(enrollment.packEnrollmentId ?? "") ?? "")}
            </span>
          </li>
        ))}
        {standalone.map((enrollment) => (
          <EnrollmentRow key={enrollment.id} enrollment={enrollment} />
        ))}
      </ul>
      {activePack ? (
        <p className="text-caption text-muted-foreground">{E.packActiveHint}</p>
      ) : (
        <>
          {available.length === 0 ? (
            <p className="text-caption text-muted-foreground">{E.noOtherSubject}</p>
          ) : (
            <AddEnrollment studentId={studentId} subjects={available} />
          )}
          {availablePacks.length > 0 ? (
            hasActiveStandalone ? (
              <p className="text-caption text-muted-foreground">{E.packNeedsStop}</p>
            ) : (
              <SubscribePack studentId={studentId} packs={availablePacks} />
            )
          ) : null}
        </>
      )}
    </SectionCard>
  );
}

function PackRow({ subscription }: { subscription: StudentPackSubscription }) {
  const E = L.enrollments;
  const [price, setPrice] = useState(String(subscription.priceAgreed));
  const [pending, startTransition] = useTransition();
  const priceChanged = Number(price) !== subscription.priceAgreed;
  const title = LABELS.packs.label(subscription.packName);

  const save = (active: boolean) => {
    startTransition(async () => {
      const result = await updatePackSubscription({ id: subscription.id, priceAgreed: price, active });
      if (result.ok) toast.success(E.saved);
      else toast.error(result.error);
    });
  };

  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-end">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-medium">{title}</span>
        <span className="text-caption text-muted-foreground">
          {LABELS.packs.includes(subscription.subjectNames.join(", "))}
        </span>
        <span className={cn("text-caption font-medium", subscription.active ? "text-success-ink" : "text-muted-foreground")}>
          {subscription.active ? E.active : E.inactive} · {LABELS.billing.cycle[subscription.billingDay]}
        </span>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`prix-pack-${subscription.id}`} className="text-caption text-muted-foreground">
            {E.price}
          </label>
          <Input
            id={`prix-pack-${subscription.id}`}
            type="number"
            inputMode="decimal"
            min={0}
            step={10}
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className="numeric w-28 font-normal"
          />
        </div>
        {priceChanged ? (
          <Button onClick={() => save(subscription.active)} disabled={pending} aria-label={`${LABELS.admin.common.save} — ${title}`}>
            {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          </Button>
        ) : null}
        <Button variant="outline" onClick={() => save(!subscription.active)} disabled={pending}>
          {subscription.active ? E.stop : E.resume}
        </Button>
      </div>
    </li>
  );
}

function SubscribePack({ studentId, packs }: { studentId: string; packs: LevelWithSubjects["packs"] }) {
  const E = L.enrollments;
  const [packId, setPackId] = useState("");
  const [pending, startTransition] = useTransition();

  const subscribe = () => {
    startTransition(async () => {
      const result = await subscribePack({ studentId, packId });
      if (result.ok) {
        toast.success(E.packAdded);
        setPackId("");
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1">
        <label htmlFor={`pack-${studentId}`} className="text-caption text-muted-foreground">
          {E.addPack}
        </label>
        <NativeSelect id={`pack-${studentId}`} value={packId} onChange={(event) => setPackId(event.target.value)}>
          <option value="">{E.choosePack}</option>
          {packs.map((pack) => (
            <option key={pack.id} value={pack.id}>
              {`${pack.name} — ${formatMAD(pack.monthlyPrice)}`}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button onClick={subscribe} disabled={!packId || pending}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
        {E.addPack}
      </Button>
    </div>
  );
}

function EnrollmentRow({ enrollment }: { enrollment: StudentEnrollment }) {
  const E = L.enrollments;
  const [price, setPrice] = useState(String(enrollment.priceAgreed));
  const [pending, startTransition] = useTransition();
  const priceChanged = Number(price) !== enrollment.priceAgreed;

  const save = (active: boolean) => {
    startTransition(async () => {
      const result = await updateEnrollment({ id: enrollment.id, priceAgreed: price, active });
      if (result.ok) toast.success(E.saved);
      else toast.error(result.error);
    });
  };

  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-end">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-medium">{enrollment.subjectName}</span>
        <span className={cn("text-caption font-medium", enrollment.active ? "text-success-ink" : "text-muted-foreground")}>
          {enrollment.active ? E.active : E.inactive} · {LABELS.billing.cycle[enrollment.billingDay]}
        </span>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`prix-${enrollment.id}`} className="text-caption text-muted-foreground">
            {E.price}
          </label>
          <Input
            id={`prix-${enrollment.id}`}
            type="number"
            inputMode="decimal"
            min={0}
            step={10}
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className="numeric w-28 font-normal"
          />
        </div>
        {priceChanged ? (
          <Button onClick={() => save(enrollment.active)} disabled={pending} aria-label={`${LABELS.admin.common.save} — ${enrollment.subjectName}`}>
            {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          </Button>
        ) : null}
        <Button variant="outline" onClick={() => save(!enrollment.active)} disabled={pending}>
          {enrollment.active ? E.stop : E.resume}
        </Button>
      </div>
    </li>
  );
}

function AddEnrollment({ studentId, subjects }: { studentId: string; subjects: LevelWithSubjects["subjects"] }) {
  const E = L.enrollments;
  const [subjectId, setSubjectId] = useState("");
  const [pending, startTransition] = useTransition();

  const add = () => {
    startTransition(async () => {
      const result = await addEnrollment({ studentId, subjectId });
      if (result.ok) {
        toast.success(E.added);
        setSubjectId("");
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1">
        <label htmlFor={`ajout-${studentId}`} className="text-caption text-muted-foreground">
          {E.add}
        </label>
        <NativeSelect id={`ajout-${studentId}`} value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
          <option value="">{E.chooseSubject}</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button onClick={add} disabled={!subjectId || pending}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
        {E.add}
      </Button>
    </div>
  );
}
