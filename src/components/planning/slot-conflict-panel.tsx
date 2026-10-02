"use client";

import { CalendarClock, DoorOpen, Lightbulb, TriangleAlert, Users } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { useLabels } from "@/lib/i18n/client";
import type { RoomSuggestion, SlotConflict, SlotConflictReport, TimeSuggestion } from "@/lib/schedule-conflicts";
import { cn } from "@/lib/utils";

type Props = {
  report: SlotConflictReport;
  pending: boolean;
  onApplyRoom: (suggestion: RoomSuggestion) => void;
  onApplyTime: (suggestion: TimeSuggestion) => void;
};

/**
 * Refus expliqué d'un créneau : qui occupe la place, puis les issues (salles libres,
 * créneaux libres proches), chacune applicable en un clic.
 */
export function SlotConflictPanel({ report, pending, onApplyRoom, onApplyTime }: Props) {
  const LABELS = useLabels();
  const C = LABELS.admin.planning.conflict;
  const ref = useRef<HTMLDivElement>(null);
  const sameDay = report.times.filter((time) => time.sameDay);
  const otherDays = report.times.filter((time) => !time.sameDay);
  const roomOnly = report.conflicts.every((conflict) => conflict.type === "room");

  // Le panneau apparaît sous le formulaire : on l'amène à l'écran.
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [report]);

  return (
    <div ref={ref} className="flex flex-col gap-4">
      <div role="alert" className="flex gap-3 rounded-lg bg-danger/10 px-4 py-3 text-danger-ink">
        <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="flex min-w-0 flex-col gap-2">
          <p className="font-semibold">{C.title}</p>
          <ul className="flex flex-col gap-2">
            {report.conflicts.map((conflict) => (
              <li key={`${conflict.type}-${conflict.slotId}`} className="flex flex-col gap-0.5">
                <span className="text-caption font-semibold tracking-wide uppercase">{C.types[conflict.type]}</span>
                <span>{explain(conflict, LABELS)}</span>
              </li>
            ))}
          </ul>
          <p className="flex items-center gap-1.5 text-caption">
            <Users className="size-3.5 shrink-0" aria-hidden />
            {C.forecast(report.enrolled)}
          </p>
        </div>
      </div>

      <section aria-labelledby="conflit-solutions" className="flex flex-col gap-3 rounded-lg bg-muted px-4 py-3">
        <h3 id="conflit-solutions" className="flex items-center gap-2 font-semibold">
          <Lightbulb className="size-4 text-primary" aria-hidden />
          {C.solutions}
        </h3>

        {roomOnly ? (
          <div className="flex flex-col gap-1">
            <h4 className="text-caption font-medium text-muted-foreground">{C.freeRooms}</h4>
            {report.rooms.length === 0 ? (
              <p className="text-caption text-muted-foreground">{C.noFreeRoom}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-divider">
                {report.rooms.map((room) => (
                  <SuggestionRow
                    key={room.roomId}
                    icon={DoorOpen}
                    title={room.name}
                    detail={room.capacity === null ? C.capacityUnknown : LABELS.rooms.places(room.capacity)}
                    warning={room.tooSmall ? C.tooSmall(report.enrolled) : null}
                    actionLabel={C.applyRoom(room.name)}
                    pending={pending}
                    onApply={() => onApplyRoom(room)}
                  />
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {report.times.length === 0 ? (
          <div className="flex flex-col gap-1">
            <h4 className="text-caption font-medium text-muted-foreground">{C.freeTimes}</h4>
            <p className="text-caption text-muted-foreground">{C.noFreeTime}</p>
          </div>
        ) : (
          [
            { key: "meme-jour", title: `${C.freeTimes} · ${C.sameDay}`, items: sameDay },
            { key: "semaine", title: `${C.freeTimes} · ${C.otherDays}`, items: otherDays },
          ]
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <div key={group.key} className="flex flex-col gap-1">
                <h4 className="text-caption font-medium text-muted-foreground">{group.title}</h4>
                <ul className="flex flex-col divide-y divide-divider">
                  {group.items.map((time) => {
                    const day = LABELS.days[time.dayOfWeek] ?? "";
                    const hours = LABELS.teacher.schedule.time(time.startTime, time.endTime);
                    return (
                      <SuggestionRow
                        key={`${time.dayOfWeek}-${time.startTime}`}
                        icon={CalendarClock}
                        title={`${day} · ${hours}`}
                        detail={time.roomName}
                        warning={time.tooSmall ? C.tooSmall(report.enrolled) : null}
                        actionLabel={C.applyTime(day, hours, time.roomName)}
                        pending={pending}
                        onApply={() => onApplyTime(time)}
                      />
                    );
                  })}
                </ul>
              </div>
            ))
        )}
      </section>
    </div>
  );
}

function SuggestionRow({
  icon: Icon,
  title,
  detail,
  warning,
  actionLabel,
  pending,
  onApply,
}: {
  icon: typeof DoorOpen;
  title: string;
  detail: string;
  warning: string | null;
  actionLabel: string;
  pending: boolean;
  onApply: () => void;
}) {
  const LABELS = useLabels();
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="flex min-w-0 items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="flex min-w-0 flex-col">
          <span className="numeric font-medium">{title}</span>
          <span className={cn("text-caption", warning ? "font-medium text-warning-ink" : "text-muted-foreground")}>
            {warning ? `${detail} · ${warning}` : detail}
          </span>
        </span>
      </span>
      <Button type="button" variant="outline" disabled={pending} onClick={onApply} aria-label={actionLabel} className="shrink-0">
        {LABELS.admin.planning.conflict.apply}
      </Button>
    </li>
  );
}

function explain(conflict: SlotConflict, LABELS: ReturnType<typeof useLabels>): string {
  const C = LABELS.admin.planning.conflict;
  const day = LABELS.days[conflict.dayOfWeek] ?? "";
  const hours = C.hours(conflict.startTime, conflict.endTime);
  const enrolled = C.enrolled(conflict.enrolled);
  switch (conflict.type) {
    case "room":
      return C.room(conflict.roomName, day, hours, conflict.teacherName, conflict.subjectName, conflict.levelName, enrolled);
    case "teacher":
      return C.teacher(conflict.teacherName, day, hours, conflict.subjectName, conflict.levelName, conflict.roomName, enrolled);
    case "level":
      return C.level(conflict.levelName, day, hours, conflict.subjectName, conflict.teacherName, conflict.roomName, enrolled);
  }
}
