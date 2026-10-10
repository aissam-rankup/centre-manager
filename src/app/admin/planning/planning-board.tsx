"use client";

import { CalendarPlus, CalendarRange, MoveRight, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { useWatch } from "react-hook-form";
import { toast } from "sonner";

import { DeleteSlotButton } from "@/components/admin/delete-buttons";
import { FormDialog } from "@/components/admin/form-dialog";
import { useActionForm } from "@/components/admin/use-action-form";
import { subjectTones } from "@/components/dashboard/progress-tile";
import { SlotConflictPanel } from "@/components/planning/slot-conflict-panel";
import { type DropTarget, useSlotDrag } from "@/components/planning/use-slot-drag";
import { useSlotMove } from "@/components/planning/use-slot-move";
import { type FreeBlock, PX_PER_MINUTE, WeekGrid } from "@/components/planning/week-grid";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { abandonSlotConflicts, saveSlot } from "@/lib/actions/admin";
import type { PlanningData, PlanningSlot } from "@/lib/data/admin";
import { today } from "@/lib/format";
import { useLabels, useMessage } from "@/lib/i18n/client";
import { gridRange, isOverloaded, minutesToTime, PLANNING_AXES, type PlanningAxis, roomOpportunities } from "@/lib/planning-grid";
import { toMinutes } from "@/lib/rooms";
import type { SlotConflictReport } from "@/lib/schedule-conflicts";
import { cn } from "@/lib/utils";
import { adminSchemas } from "@/lib/validation/admin";

const WEEK = [1, 2, 3, 4, 5, 6, 0] as const;

type Entity = { id: string; name: string; detail: string | null; warning: boolean; free: boolean };

const DESKTOP = "(min-width: 768px)";

function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Grille de la semaine (ordinateur) ou d'un seul jour (téléphone). Rendu serveur : téléphone. */
function useDesktop(): boolean {
  return useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP).matches, () => false);
}

function matches(slot: PlanningSlot, axis: PlanningAxis, id: string): boolean {
  return axis === "room" ? slot.roomId === id : axis === "teacher" ? slot.teacherId === id : slot.levelId === id;
}

export function PlanningBoard({ data }: { data: PlanningData }) {
  const LABELS = useLabels();
  const L = LABELS.admin.planning;
  const G = L.grid;
  const [axis, setAxis] = useState<PlanningAxis>("room");
  const [entityId, setEntityId] = useState<string | null>(null);
  // Le dimanche n'apparaît que s'il porte des créneaux.
  const days: number[] = WEEK.filter((day) => day !== 0 || data.slots.some((slot) => slot.dayOfWeek === 0));
  const [mobileDay, setMobileDay] = useState<number>(() => {
    const weekday = today().getDay();
    return days.includes(weekday) ? weekday : (days[0] ?? 1);
  });
  const { move, pending, dialog } = useSlotMove(data);

  const roomsById = new Map(data.rooms.map((room) => [room.id, room] as const));
  // Pendant l'enregistrement, le cours s'affiche déjà à sa nouvelle place.
  const slots = data.slots.map((slot) => {
    const next = pending[slot.id];
    return next ? { ...slot, ...next, room: roomsById.get(next.roomId)?.name ?? slot.room } : slot;
  });
  // Couleur par matière, stable quel que soit le filtre.
  const tones = subjectTones(data.subjects.map((subject) => subject.id));
  // Sur téléphone, une seule colonne : seulement les heures utiles de ce jour-là.
  const desktop = useDesktop();
  const daySlots = data.slots.filter((slot) => slot.dayOfWeek === mobileDay);
  const range = gridRange(desktop || daySlots.length === 0 ? data.slots : daySlots);
  const opportunities = roomOpportunities(slots, data.rooms);
  // Une proposition par cours à l'étroit : la plus petite salle libre suffisante.
  const bestOpportunities = opportunities.filter((item, index) => opportunities.findIndex((other) => other.slotId === item.slotId) === index);

  const entities: Entity[] =
    axis === "room"
      ? data.rooms
          .filter((room) => room.isActive || slots.some((slot) => slot.roomId === room.id))
          .map((room) => ({
            id: room.id,
            name: room.isActive ? room.name : L.roomInactive(room.name),
            detail: room.capacity === null ? null : LABELS.rooms.places(room.capacity),
            warning: slots.some((slot) => slot.roomId === room.id && isOverloaded(slot, roomsById)),
            free: bestOpportunities.some((item) => item.roomId === room.id),
          }))
      : axis === "teacher"
        ? data.teachers
            .filter(
              (teacher) =>
                slots.some((slot) => slot.teacherId === teacher.id) || data.subjects.some((subject) => subject.teacherIds.includes(teacher.id)),
            )
            .map((teacher) => ({
              id: teacher.id,
              name: teacher.fullName,
              detail: LABELS.rooms.week.slots(slots.filter((slot) => slot.teacherId === teacher.id).length),
              warning: false,
              free: false,
            }))
        : data.levels.map((level) => ({
            id: level.id,
            name: level.name,
            detail: LABELS.rooms.week.slots(slots.filter((slot) => slot.levelId === level.id).length),
            warning: false,
            free: false,
          }));
  const selected = entities.find((entity) => entity.id === entityId) ?? null;
  const visible = selected ? slots.filter((slot) => matches(slot, axis, selected.id)) : slots;

  const onDrop = (slotId: string, target: DropTarget) => {
    const slot = data.slots.find((item) => item.id === slotId);
    if (!slot) return;
    if (target.kind === "time") {
      const duration = toMinutes(slot.endTime) - toMinutes(slot.startTime);
      move(slot, { dayOfWeek: target.day, startTime: minutesToTime(target.start), endTime: minutesToTime(target.start + duration) });
    } else if (target.kind === "day") {
      setMobileDay(target.day);
      move(slot, { dayOfWeek: target.day });
    } else if (axis === "room") {
      const room = roomsById.get(target.id);
      if (!room) return;
      if (!room.isActive) toast.error(G.roomInactive);
      else move(slot, { roomId: room.id });
    } else if (axis === "teacher") {
      const teacher = data.teachers.find((item) => item.id === target.id);
      if (!teacher) return;
      const subject = data.subjects.find((item) => item.id === slot.subjectId);
      if (!subject?.teacherIds.includes(teacher.id)) toast.error(G.notEligible(teacher.fullName, slot.subjectName));
      else move(slot, { teacherId: teacher.id });
    }
  };
  const { drag, bind } = useSlotDrag({ pxPerMinute: PX_PER_MINUTE, rangeStart: range.start, rangeEnd: range.end, onDrop });

  const dragTarget = drag?.target ?? null;
  let dragLabel: string | null = null;
  if (drag && dragTarget?.kind === "time") {
    const end = minutesToTime(dragTarget.start + drag.duration);
    dragLabel = `${LABELS.days[dragTarget.day]} ${LABELS.teacher.schedule.time(minutesToTime(dragTarget.start), end)}`;
  } else if (dragTarget?.kind === "day") {
    dragLabel = LABELS.days[dragTarget.day] ?? null;
  } else if (dragTarget?.kind === "entity") {
    const entity = entities.find((item) => item.id === dragTarget.id);
    dragLabel = entity ? G.dropOn(entity.name) : null;
  }

  // Salle vide alors que la demande existe : dessinée dans la salle choisie, résumée au-dessus.
  const free: FreeBlock[] =
    axis === "room" && selected
      ? opportunities
          .filter((item) => item.roomId === selected.id)
          .flatMap((item) => {
            const slot = slots.find((candidate) => candidate.id === item.slotId);
            if (!slot) return [];
            return [
              {
                key: `${item.slotId}-${item.roomId}`,
                day: slot.dayOfWeek,
                start: toMinutes(slot.startTime),
                end: toMinutes(slot.endTime),
                label: G.freeLabel(slot.subjectName, slot.enrolled),
                actionLabel: G.moveHere,
                ariaLabel: G.moveHereLabel(slot.subjectName, selected.name),
                onAction: () => move(slot, { roomId: item.roomId }),
              },
            ];
          })
      : [];
  const overloadedCount = slots.filter((slot) => isOverloaded(slot, roomsById)).length;
  const droppable = axis !== "level";

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

      {data.slots.length === 0 ? (
        <EmptyState icon={CalendarRange} title={L.emptyTitle} description={L.emptyDescription} />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <div role="group" aria-label={G.axis} className="grid grid-cols-3 rounded-xl bg-muted p-1 sm:inline-flex sm:self-start">
              {PLANNING_AXES.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={axis === item}
                  onClick={() => {
                    setAxis(item);
                    setEntityId(null);
                  }}
                  className={cn(
                    "inline-flex h-10 min-w-0 items-center justify-center rounded-lg px-2 font-medium whitespace-nowrap transition-colors sm:px-4",
                    axis === item ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="truncate sm:hidden">{G.axesShort[item]}</span>
                  <span className="hidden sm:inline">{G.axes[item]}</span>
                </button>
              ))}
            </div>

            <div role="group" aria-label={G.show} className="no-scrollbar -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
              <div className="flex w-max gap-2 py-1">
                <EntityChip name={G.all[axis]} pressed={entityId === null} onClick={() => setEntityId(null)} />
                {entities.map((entity) => (
                  <EntityChip
                    key={entity.id}
                    name={entity.name}
                    detail={entity.detail}
                    pressed={entityId === entity.id}
                    onClick={() => setEntityId(entity.id)}
                    dropId={droppable ? entity.id : undefined}
                    dragging={drag !== null && droppable}
                    targeted={dragTarget?.kind === "entity" && dragTarget.id === entity.id}
                    warning={entity.warning ? G.overloadedShort : null}
                    free={entity.free ? G.opportunitiesTitle : null}
                  />
                ))}
              </div>
            </div>
          </div>

          {axis === "room" && bestOpportunities.length > 0 ? (
            <section aria-labelledby="salles-vides" className="flex flex-col gap-2 rounded-xl bg-success/10 px-4 py-3">
              <h2 id="salles-vides" className="flex items-center gap-2 font-semibold text-success-ink">
                <Sparkles className="size-4" aria-hidden />
                {G.opportunitiesTitle}
              </h2>
              <ul className="flex flex-col divide-y divide-success/20">
                {bestOpportunities.map((item) => {
                  const slot = slots.find((candidate) => candidate.id === item.slotId);
                  const room = roomsById.get(item.roomId);
                  const current = slot ? roomsById.get(slot.roomId) : undefined;
                  if (!slot || !room || room.capacity === null || !current || current.capacity === null) return null;
                  return (
                    <li key={item.slotId} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="flex min-w-0 flex-col">
                        <span className="font-medium">
                          {G.opportunity(
                            slot.subjectName,
                            slot.levelName,
                            LABELS.days[slot.dayOfWeek] ?? "",
                            LABELS.teacher.schedule.time(slot.startTime, slot.endTime),
                            slot.enrolled,
                            current.name,
                            current.capacity,
                          )}
                        </span>
                        <span className="text-caption text-muted-foreground">{G.opportunityRoom(room.name, room.capacity)}</span>
                      </span>
                      <Button type="button" variant="outline" className="self-start sm:self-center" onClick={() => move(slot, { roomId: room.id })}>
                        <MoveRight aria-hidden />
                        {G.moveTo(room.name)}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <div className="flex flex-col gap-2">
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
              <span>{axis === "room" ? G.dragHintRoom : axis === "teacher" ? G.dragHintTeacher : G.dragHint}</span>
              <span className="md:hidden">{G.touchHint}</span>
              {overloadedCount > 0 ? (
                <span className="flex items-center gap-1 font-medium text-danger-ink">
                  <TriangleAlert className="size-3.5" aria-hidden />
                  {G.overloadedCount(overloadedCount)}
                </span>
              ) : null}
            </p>
            {selected && visible.length === 0 ? <p className="text-caption font-medium">{G.emptyEntity}</p> : null}

            <div role="group" aria-label={G.day} className="no-scrollbar -mx-4 overflow-x-auto px-4 md:hidden">
              <div className="flex w-max gap-2 py-1">
                {days.map((day) => (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={mobileDay === day}
                    data-drop-daytab={day}
                    onClick={() => setMobileDay(day)}
                    className={cn(
                      "inline-flex h-11 min-w-12 items-center justify-center rounded-full border px-3 font-medium transition-colors",
                      mobileDay === day ? "border-primary bg-primary text-primary-foreground" : "bg-card",
                      dragTarget?.kind === "day" && dragTarget.day === day && "ring-2 ring-primary ring-offset-2",
                    )}
                  >
                    {(LABELS.days[day] ?? "").slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>

            <WeekGrid
              slots={visible}
              days={days}
              mobileDay={mobileDay}
              range={range}
              hidden={selected ? axis : null}
              rooms={roomsById}
              tones={tones}
              pendingIds={new Set(Object.keys(pending))}
              drag={drag}
              dragLabel={dragLabel}
              bind={bind}
              wrap={(slot, trigger) => <SlotDialog data={data} slot={data.slots.find((item) => item.id === slot.id) ?? slot} trigger={trigger} />}
              free={free}
            />
          </div>
          {dialog}
        </>
      )}
    </>
  );
}

/** Filtre de l'axe ; sur une salle ou un professeur, on peut aussi y déposer un cours. */
function EntityChip({
  name,
  detail = null,
  pressed,
  onClick,
  dropId,
  dragging = false,
  targeted = false,
  warning = null,
  free = null,
}: {
  name: string;
  detail?: string | null;
  pressed: boolean;
  onClick: () => void;
  dropId?: string;
  dragging?: boolean;
  targeted?: boolean;
  warning?: string | null;
  free?: string | null;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      data-drop-entity={dropId}
      onClick={onClick}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-full border px-4 font-medium whitespace-nowrap transition-colors",
        pressed ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
        dragging && "border-dashed border-primary",
        targeted && "ring-2 ring-primary ring-offset-2",
      )}
    >
      {name}
      {detail ? <span className={cn("text-caption", pressed ? "text-primary-foreground/80" : "text-muted-foreground")}>{detail}</span> : null}
      {warning ? <TriangleAlert className={cn("size-4", pressed ? "text-primary-foreground" : "text-danger-ink")} aria-label={warning} /> : null}
      {free ? <Sparkles className={cn("size-4", pressed ? "text-primary-foreground" : "text-success-ink")} aria-label={free} /> : null}
    </button>
  );
}

function SlotDialog({ data, slot, trigger }: { data: PlanningData; slot?: PlanningSlot; trigger: React.ReactElement }) {
  const LABELS = useLabels();
  const L = LABELS.admin.planning;
  const message = useMessage();
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
      error={report || !error ? null : message(error)}
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
