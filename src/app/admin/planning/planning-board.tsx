"use client";

import { CalendarPlus, CalendarRange, Clock, DoorOpen, Trash2 } from "lucide-react";
import { useState } from "react";
import { useWatch } from "react-hook-form";

import { DeleteSlotButton } from "@/components/admin/delete-buttons";
import { FormDialog } from "@/components/admin/form-dialog";
import { useActionForm } from "@/components/admin/use-action-form";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { subjectTones } from "@/components/dashboard/progress-tile";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SlotConflictPanel } from "@/components/planning/slot-conflict-panel";
import { abandonSlotConflicts, saveSlot } from "@/lib/actions/admin";
import { useLabels } from "@/lib/i18n/client";
import type { PlanningData, PlanningSlot } from "@/lib/data/admin";
import type { SlotConflictReport } from "@/lib/schedule-conflicts";
import { cn } from "@/lib/utils";
import { adminSchemas } from "@/lib/validation/admin";

const WEEK = [1, 2, 3, 4, 5, 6, 0] as const;

export function PlanningBoard({ data }: { data: PlanningData }) {
  const LABELS = useLabels();
  const L = LABELS.admin.planning;
  const [levelId, setLevelId] = useState<string | null>(null);
  const slots = levelId ? data.slots.filter((slot) => slot.levelId === levelId) : data.slots;
  // Couleur par matière, stable quel que soit le filtre de niveau.
  const tones = subjectTones(data.subjects.map((subject) => subject.id));
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
                      daySlots.map((slot) => <SlotCard key={slot.id} slot={slot} data={data} tone={tones.get(slot.subjectId) ?? ""} />)
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

function SlotCard({ slot, data, tone }: { slot: PlanningSlot; data: PlanningData; tone: string }) {
  const LABELS = useLabels();
  const L = LABELS.admin.planning;
  return (
    <SlotDialog
      data={data}
      slot={slot}
      trigger={
        <button
          type="button"
          aria-label={`${L.editSlot} — ${slot.subjectName}, ${LABELS.days[slot.dayOfWeek]} ${slot.startTime}`}
          className={cn("card-interactive flex w-full flex-col gap-1 rounded-xl p-3 text-left text-white shadow-card", tone)}
        >
          <span className="numeric flex items-center gap-1.5 text-caption font-medium">
            <Clock className="size-4" aria-hidden />
            {LABELS.teacher.schedule.time(slot.startTime, slot.endTime)}
          </span>
          <span className="font-semibold">{slot.subjectName}</span>
          <span className="text-caption text-white/85">{slot.levelName}</span>
          <span className="flex items-center gap-1.5 text-caption text-white/85">
            <StudentAvatar name={slot.teacherName} photoUrl={slot.teacherPhotoUrl} size="mini" className="border-white/60" />
            <span className="truncate">{slot.teacherName}</span>
          </span>
          <span className="flex items-center gap-1.5 text-caption text-white/85">
            <DoorOpen className="size-4 shrink-0" aria-hidden />
            {slot.room}
          </span>
        </button>
      }
    />
  );
}

function SlotDialog({ data, slot, trigger }: { data: PlanningData; slot?: PlanningSlot; trigger: React.ReactElement }) {
  const LABELS = useLabels();
  const L = LABELS.admin.planning;
  const [report, setReport] = useState<SlotConflictReport | null>(null);
  const { form, open, onOpenChange, onSubmit, pending, error } = useActionForm({
    schema: adminSchemas(LABELS).slotSchema,
    defaultValues: {
      id: slot?.id ?? null,
      subjectId: slot?.subjectId ?? "",
      teacherId: slot?.teacherId ?? "",
      dayOfWeek: slot?.dayOfWeek ?? 1,
      startTime: slot?.startTime ?? "17:00",
      endTime: slot?.endTime ?? "18:30",
      roomId: slot?.roomId ?? "",
      conflictLogIds: [],
    },
    action: async (values) => {
      const result = await saveSlot(values);
      if (!result.ok && result.conflict) {
        const conflict = result.conflict;
        setReport(conflict);
        // Les conflits successifs restent liés : l'issue finale les clôt tous.
        form.setValue("conflictLogIds", [...(form.getValues("conflictLogIds") ?? []), ...conflict.logIds].slice(-20));
      } else {
        setReport(null);
      }
      return result;
    },
    successMessage: report ? L.conflict.resolved : slot ? LABELS.admin.common.saved : LABELS.admin.common.created,
  });
  const errors = form.formState.errors;
  const subjectId = useWatch({ control: form.control, name: "subjectId" });

  const subject = data.subjects.find((item) => item.id === subjectId);
  const eligibleTeachers = data.teachers.filter((teacher) => subject?.teacherIds.includes(teacher.id));
  // Salles actives, plus la salle actuelle du créneau si elle a été désactivée.
  const rooms = data.rooms.filter((room) => room.isActive || room.id === slot?.roomId);

  const handleOpenChange = (value: boolean) => {
    // Fenêtre fermée sans issue : les conflits signalés sont abandonnés.
    if (!value && report) {
      const logIds = form.getValues("conflictLogIds") ?? [];
      if (logIds.length > 0) void abandonSlotConflicts(logIds);
    }
    setReport(null);
    onOpenChange(value);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      trigger={trigger}
      title={slot ? L.editSlot : L.newSlot}
      pending={pending}
      error={report ? null : error}
      onSubmit={onSubmit}
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

      <FormField id="slot-room" label={L.room} error={errors.roomId?.message} hint={rooms.length === 0 ? L.noRooms : L.roomHint}>
        <NativeSelect disabled={rooms.length === 0} {...form.register("roomId")}>
          <option value="">{L.chooseRoom}</option>
          {rooms.map((room) => {
            const name = room.isActive ? room.name : L.roomInactive(room.name);
            return (
              <option key={room.id} value={room.id}>
                {room.capacity === null ? name : `${name} · ${LABELS.rooms.places(room.capacity)}`}
              </option>
            );
          })}
        </NativeSelect>
      </FormField>

      {report ? (
        <SlotConflictPanel
          report={report}
          pending={pending}
          onApplyRoom={(room) => {
            form.setValue("roomId", room.roomId);
            void onSubmit();
          }}
          onApplyTime={(time) => {
            form.setValue("dayOfWeek", time.dayOfWeek);
            form.setValue("startTime", time.startTime);
            form.setValue("endTime", time.endTime);
            form.setValue("roomId", time.roomId);
            void onSubmit();
          }}
        />
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
