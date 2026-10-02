"use client";

import { ChevronDown, DoorOpen, Pencil, Plus, Power, PowerOff, Trash2, TriangleAlert, Users } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormDialog } from "@/components/admin/form-dialog";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deleteRoom, saveRoom, setRoomActive } from "@/lib/actions/rooms";
import { useLabels } from "@/lib/i18n/client";
import { ROOM_EQUIPMENT, type RoomEquipment, type RoomView } from "@/lib/rooms";
import { cn } from "@/lib/utils";

export function RoomsBoard({ rooms }: { rooms: RoomView[] }) {
  const LABELS = useLabels();
  const R = LABELS.rooms;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <RoomDialog />
      </div>
      {rooms.length === 0 ? (
        <EmptyState icon={DoorOpen} title={R.emptyTitle} description={R.emptyDescription} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {rooms.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RoomCard({ room }: { room: RoomView }) {
  const LABELS = useLabels();
  const R = LABELS.rooms;
  const W = R.week;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const overloaded = room.capacity === null ? [] : room.slots.filter((slot) => slot.enrolled > (room.capacity ?? 0));

  return (
    <li className={cn("flex flex-col gap-4 rounded-xl bg-card p-5 shadow-card", !room.isActive && "opacity-70")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <DoorOpen className="size-5" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="flex flex-wrap items-center gap-2">
              <span className="truncate text-section">{room.name}</span>
              {!room.isActive ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-caption font-medium text-muted-foreground">{R.inactive}</span>
              ) : null}
            </span>
            <span className="text-caption text-muted-foreground">
              {[room.floor, room.capacity !== null ? R.places(room.capacity) : null].filter(Boolean).join(" · ") || " "}
            </span>
          </div>
        </div>
        <RoomDialog room={room} />
      </div>

      {room.capacity === null ? (
        <p className="flex items-center gap-1.5 text-caption font-medium text-warning-ink">
          <TriangleAlert className="size-3.5" aria-hidden />
          {R.capacityUnknown}
        </p>
      ) : null}

      {room.equipment.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={R.equipment}>
          {room.equipment.map((code) => (
            <li key={code} className="rounded-full bg-muted px-2.5 py-0.5 text-caption font-medium">
              {R.equipments[code]}
            </li>
          ))}
        </ul>
      ) : null}

      {room.notes ? <p className="text-caption text-muted-foreground">{room.notes}</p> : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption">
        <span className="font-medium">{W.slots(room.slots.length)}</span>
        <span className="text-muted-foreground">{W.hours(new Intl.NumberFormat("fr-FR").format(room.weeklyHours))}</span>
        {overloaded.length > 0 ? (
          <span className="flex items-center gap-1 font-medium text-danger-ink">
            <TriangleAlert className="size-3.5" aria-hidden />
            {W.overCapacityShort} ({overloaded.length})
          </span>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex items-center gap-1.5 self-start text-caption font-medium text-primary hover:underline"
      >
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
        {W.title}
      </button>
      {open ? (
        room.slots.length === 0 ? (
          <p className="text-caption text-muted-foreground">{W.empty}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-divider rounded-xl bg-muted px-3">
            {room.slots.map((slot) => {
              const over = room.capacity !== null && slot.enrolled > room.capacity;
              return (
                <li key={slot.id} className="flex items-start justify-between gap-3 py-2">
                  <span className="flex min-w-0 flex-col">
                    <span className="text-caption font-medium">
                      {LABELS.days[slot.dayOfWeek]} · {slot.startTime} – {slot.endTime}
                    </span>
                    <span className="truncate text-caption text-muted-foreground">
                      {slot.subjectName} · {slot.levelName} · {slot.teacherName}
                    </span>
                  </span>
                  <span
                    className={cn("flex shrink-0 items-center gap-1 text-caption", over ? "font-semibold text-danger-ink" : "text-muted-foreground")}
                    title={over && room.capacity !== null ? W.overCapacity(slot.enrolled, room.capacity) : undefined}
                  >
                    <Users className="size-3.5" aria-hidden />
                    {W.enrolled(slot.enrolled)}
                  </span>
                </li>
              );
            })}
          </ul>
        )
      ) : null}

      <div className="mt-auto flex flex-wrap gap-2 border-t border-divider pt-3">
        <Button
          variant="ghost"
          disabled={pending}
          title={room.isActive ? R.deactivateHint : undefined}
          onClick={() =>
            startTransition(async () => {
              const result = await setRoomActive({ id: room.id, active: !room.isActive });
              if (result.ok) toast.success(room.isActive ? R.deactivated : R.activated);
              else toast.error(result.error);
            })
          }
        >
          {room.isActive ? <PowerOff aria-hidden /> : <Power aria-hidden />}
          {room.isActive ? R.deactivate : R.activate}
        </Button>
        {room.slots.length === 0 ? (
          <ConfirmAction
            trigger={
              <Button variant="ghost" className="text-danger-ink">
                <Trash2 aria-hidden />
                {R.delete}
              </Button>
            }
            title={R.deleteTitle(room.name)}
            description={R.deleteDescription}
            confirmLabel={R.delete}
            successMessage={R.deleted}
            action={() => deleteRoom(room.id)}
          />
        ) : null}
      </div>
    </li>
  );
}

function RoomDialog({ room }: { room?: RoomView }) {
  const LABELS = useLabels();
  const R = LABELS.rooms;
  const initial = () => ({
    name: room?.name ?? "",
    capacity: room?.capacity === null || room?.capacity === undefined ? "" : String(room.capacity),
    floor: room?.floor ?? "",
    equipment: room?.equipment ?? (["whiteboard"] as RoomEquipment[]),
    notes: room?.notes ?? "",
  });
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const idPrefix = room ? `salle-${room.id}` : "salle-nouvelle";

  const toggle = (code: RoomEquipment) =>
    setValues((current) => ({
      ...current,
      equipment: current.equipment.includes(code) ? current.equipment.filter((item) => item !== code) : [...current.equipment, code],
    }));

  return (
    <FormDialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setValues(initial());
          setErrors({});
          setError(null);
        }
      }}
      title={room ? R.editTitle(room.name) : R.addTitle}
      pending={pending}
      error={error}
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await saveRoom({ id: room?.id, ...values });
          if (!result.ok) {
            setError(result.error);
            setErrors(result.fieldErrors ?? {});
            return;
          }
          toast.success(R.saved);
          setOpen(false);
        });
      }}
      trigger={
        room ? (
          <Button variant="ghost" aria-label={`${R.edit} — ${room.name}`}>
            <Pencil aria-hidden />
          </Button>
        ) : (
          <Button>
            <Plus aria-hidden />
            {R.add}
          </Button>
        )
      }
    >
      <FormField id={`${idPrefix}-nom`} label={R.name} error={errors.name}>
        <Input maxLength={40} value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={`${idPrefix}-capacite`} label={R.capacity} hint={R.capacityHint} error={errors.capacity}>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={500}
            value={values.capacity}
            onChange={(event) => setValues((current) => ({ ...current, capacity: event.target.value }))}
            className="numeric font-normal"
          />
        </FormField>
        <FormField id={`${idPrefix}-etage`} label={R.floor}>
          <Input
            maxLength={40}
            placeholder={R.floorPlaceholder}
            value={values.floor}
            onChange={(event) => setValues((current) => ({ ...current, floor: event.target.value }))}
          />
        </FormField>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-table font-medium">{R.equipment}</legend>
        <div className="grid grid-cols-2 gap-2">
          {ROOM_EQUIPMENT.map((code) => (
            <label key={code} className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={values.equipment.includes(code)} onChange={() => toggle(code)} className="size-4 accent-[var(--primary)]" />
              {R.equipments[code]}
            </label>
          ))}
        </div>
      </fieldset>
      <FormField id={`${idPrefix}-notes`} label={R.notes}>
        <Textarea rows={2} maxLength={300} value={values.notes} onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))} />
      </FormField>
    </FormDialog>
  );
}
