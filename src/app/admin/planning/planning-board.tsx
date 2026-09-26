"use client";

import { CalendarPlus, CalendarRange, Clock, DoorOpen, Trash2, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useWatch } from "react-hook-form";

import { DeleteSlotButton } from "@/components/admin/delete-buttons";
import { FormDialog } from "@/components/admin/form-dialog";
import { useActionForm } from "@/components/admin/use-action-form";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { saveSlot } from "@/lib/actions/admin";
import { LABELS } from "@/lib/constants/labels";
import type { PlanningData, PlanningSlot } from "@/lib/data/admin";
import { cn } from "@/lib/utils";
import { slotSchema } from "@/lib/validation/admin";

const L = LABELS.admin.planning;
const WEEK = [1, 2, 3, 4, 5, 6, 0] as const;

export function PlanningBoard({ data }: { data: PlanningData }) {
  const [levelId, setLevelId] = useState<string | null>(null);
  const slots = levelId ? data.slots.filter((slot) => slot.levelId === levelId) : data.slots;
  // Le dimanche n'apparaît que s'il porte des créneaux.
  const days = WEEK.filter((day) => day !== 0 || data.slots.some((slot) => slot.dayOfWeek === 0));

  return (
    <>
      <PageHeader
        title={L.title}
        description={L.description}
        actions={
          <SlotDialog
            data={data}
            trigger={
              <Button>
                <CalendarPlus aria-hidden />
                {L.newSlot}
              </Button>
            }
          />
        }
      />

      <div role="group" aria-label={L.filterLevel} className="no-scrollbar -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div className="flex w-max gap-2">
          {[{ id: null, name: L.allLevels }, ...data.levels].map((level) => (
            <button
              key={level.id ?? "tous"}
              type="button"
              aria-pressed={levelId === level.id}
              onClick={() => setLevelId(level.id)}
              className={cn(
                "inline-flex h-11 items-center rounded-full border px-4 font-medium whitespace-nowrap transition-colors",
                levelId === level.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
              )}
            >
              {level.name}
            </button>
          ))}
        </div>
      </div>

      {slots.length === 0 ? (
        <EmptyState icon={CalendarRange} title={L.emptyTitle} description={L.emptyDescription} />
      ) : (
        <div className="grid gap-4 lg:gap-3" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {days.map((day) => {
              const daySlots = slots.filter((slot) => slot.dayOfWeek === day);
              return (
                <section
                  key={day}
                  aria-labelledby={`jour-${day}`}
                  className="col-span-full flex flex-col gap-2 lg:col-span-1"
                >
                  <h2 id={`jour-${day}`} className="text-body font-semibold">
                    {LABELS.days[day]}
                  </h2>
                  <div className="flex min-h-24 flex-col gap-2 rounded-xl bg-muted/50 p-2">
                    {daySlots.length === 0 ? (
                      <p className="p-2 text-caption text-muted-foreground">{L.noSession}</p>
                    ) : (
                      daySlots.map((slot) => <SlotCard key={slot.id} slot={slot} data={data} />)
                    )}
                  </div>
                </section>
              );
            })}
        </div>
      )}
    </>
  );
}

function SlotCard({ slot, data }: { slot: PlanningSlot; data: PlanningData }) {
  return (
    <SlotDialog
      data={data}
      slot={slot}
      trigger={
        <button
          type="button"
          aria-label={`${L.editSlot} — ${slot.subjectName}, ${LABELS.days[slot.dayOfWeek]} ${slot.startTime}`}
          className="card-interactive flex w-full flex-col gap-1 rounded-[10px] border bg-card p-3 text-left shadow-soft"
        >
          <span className="numeric flex items-center gap-1.5 text-caption text-brand-ink">
            <Clock className="size-4" aria-hidden />
            {LABELS.teacher.schedule.time(slot.startTime, slot.endTime)}
          </span>
          <span className="font-semibold">{slot.subjectName}</span>
          <span className="text-caption text-muted-foreground">{slot.levelName}</span>
          <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
            <StudentAvatar name={slot.teacherName} photoUrl={slot.teacherPhotoUrl} size="mini" className="border" />
            <span className="truncate">{slot.teacherName}</span>
          </span>
          <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
            <DoorOpen className="size-4 shrink-0" aria-hidden />
            {slot.room}
          </span>
        </button>
      }
    />
  );
}

/** Chevauchement de deux plages horaires « HH:MM » (bornes exclusives, comme en base). */
function overlaps(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA < endB && startB < endA;
}

function SlotDialog({ data, slot, trigger }: { data: PlanningData; slot?: PlanningSlot; trigger: React.ReactElement }) {
  const { form, open, onOpenChange, onSubmit, pending, error } = useActionForm({
    schema: slotSchema,
    defaultValues: {
      id: slot?.id ?? null,
      subjectId: slot?.subjectId ?? "",
      teacherId: slot?.teacherId ?? "",
      dayOfWeek: slot?.dayOfWeek ?? 1,
      startTime: slot?.startTime ?? "17:00",
      endTime: slot?.endTime ?? "18:30",
      room: slot?.room ?? "",
    },
    action: saveSlot,
    successMessage: slot ? LABELS.admin.common.saved : LABELS.admin.common.created,
  });
  const errors = form.formState.errors;
  const [subjectId, teacherId, dayOfWeek, startTime, endTime, room] = useWatch({
    control: form.control,
    name: ["subjectId", "teacherId", "dayOfWeek", "startTime", "endTime", "room"],
  });

  const subject = data.subjects.find((item) => item.id === subjectId);
  const eligibleTeachers = data.teachers.filter((teacher) => subject?.teacherIds.includes(teacher.id));
  const rooms = useMemo(() => [...new Set(data.slots.map((item) => item.room))].sort(), [data.slots]);

  // Détection des conflits en direct (la base les refuse aussi).
  const conflicts = useMemo(() => {
    if (!startTime || !endTime || endTime <= startTime) return [];
    const normalizedRoom = String(room ?? "").trim().toLowerCase();
    return data.slots
      .filter((other) => other.id !== slot?.id && other.dayOfWeek === Number(dayOfWeek))
      .filter((other) => overlaps(startTime, endTime, other.startTime, other.endTime))
      .flatMap((other) => {
        const label = L.conflictSlot(other.subjectName, other.levelName, LABELS.teacher.schedule.time(other.startTime, other.endTime));
        const messages: string[] = [];
        if (normalizedRoom && other.room.trim().toLowerCase() === normalizedRoom) messages.push(L.conflictRoom(other.room, label));
        if (teacherId && other.teacherId === teacherId) messages.push(L.conflictTeacher(other.teacherName, label));
        return messages;
      });
  }, [data.slots, slot?.id, dayOfWeek, startTime, endTime, room, teacherId]);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      title={slot ? L.editSlot : L.newSlot}
      pending={pending}
      error={error}
      submitDisabled={conflicts.length > 0}
      onSubmit={(event) => {
        if (conflicts.length > 0) {
          event.preventDefault();
          return;
        }
        void onSubmit(event);
      }}
    >
      <FormField id="slot-subject" label={L.subject} error={errors.subjectId?.message}>
        <NativeSelect
          {...form.register("subjectId", {
            onChange: () => form.setValue("teacherId", "", { shouldValidate: false }),
          })}
        >
          <option value="">{L.chooseSubject}</option>
          {data.levels.map((level) => (
            <optgroup key={level.id} label={level.name}>
              {data.subjects
                .filter((item) => item.levelId === level.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </NativeSelect>
      </FormField>

      <FormField
        id="slot-teacher"
        label={L.teacher}
        error={errors.teacherId?.message}
        hint={subject && eligibleTeachers.length === 0 ? L.noTeacher : undefined}
      >
        <NativeSelect disabled={!subject || eligibleTeachers.length === 0} {...form.register("teacherId")}>
          <option value="">{L.chooseTeacher}</option>
          {eligibleTeachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {teacher.fullName}
            </option>
          ))}
        </NativeSelect>
      </FormField>

      <FormField id="slot-day" label={L.day} error={errors.dayOfWeek?.message}>
        <NativeSelect {...form.register("dayOfWeek")}>
          {WEEK.map((day) => (
            <option key={day} value={day}>
              {LABELS.days[day]}
            </option>
          ))}
        </NativeSelect>
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField id="slot-start" label={L.start} error={errors.startTime?.message}>
          <Input type="time" step={300} className="numeric font-normal" {...form.register("startTime")} />
        </FormField>
        <FormField id="slot-end" label={L.end} error={errors.endTime?.message}>
          <Input type="time" step={300} className="numeric font-normal" {...form.register("endTime")} />
        </FormField>
      </div>

      <FormField id="slot-room" label={L.room} error={errors.room?.message}>
        <Input list="salles-connues" placeholder={L.roomPlaceholder} autoComplete="off" {...form.register("room")} />
      </FormField>
      <datalist id="salles-connues">
        {rooms.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>

      {conflicts.length > 0 ? (
        <div role="alert" className="flex gap-3 rounded-[10px] bg-danger/10 px-4 py-3 text-danger-ink">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div className="flex flex-col gap-1">
            <p className="font-semibold">{L.conflictTitle}</p>
            {conflicts.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        </div>
      ) : null}

      {slot ? (
        <DeleteSlotButton
          slotId={slot.id}
          label={L.deleteConfirm(slot.subjectName, LABELS.days[slot.dayOfWeek] ?? "", LABELS.teacher.schedule.time(slot.startTime, slot.endTime))}
        >
          <Button type="button" variant="destructive" className="self-start">
            <Trash2 aria-hidden />
            {L.deleteSlot}
          </Button>
        </DeleteSlotButton>
      ) : null}
    </FormDialog>
  );
}
