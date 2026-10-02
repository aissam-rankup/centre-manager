import { CircleAlert, CircleCheck, CircleDashed, DoorOpen } from "lucide-react";

import { OccupancyHeatmap } from "@/components/admin/occupancy-heatmap";
import { SectionHeading } from "@/components/dashboard/section-heading";
import { EmptyState } from "@/components/shared/empty-state";
import { ROUTES } from "@/lib/auth/routes";
import type { AppLabels } from "@/lib/constants/labels";
import { formatPercent } from "@/lib/format";
import type { OccupancyReport, RoomOccupancy, RoomStatus } from "@/lib/room-occupancy";
import { cn } from "@/lib/utils";

const hoursFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

function hours(minutes: number): string {
  return hoursFormat.format(minutes / 60);
}

const STATUS: Record<RoomStatus, { icon: typeof CircleCheck; ink: string }> = {
  saturated: { icon: CircleAlert, ink: "text-danger-ink" },
  balanced: { icon: CircleCheck, ink: "text-success-ink" },
  underused: { icon: CircleDashed, ink: "text-warning-ink" },
};

/** Bloc « Occupation des salles » du tableau de bord admin : chiffres clés, salles, heures. */
export function RoomOccupancyOverview({ data, LABELS }: { data: OccupancyReport; LABELS: AppLabels }) {
  const O = LABELS.roomOccupancy;

  return (
    <section aria-labelledby="occupation" className="flex flex-col gap-3">
      <SectionHeading id="occupation" title={O.title} href={ROUTES.admin.rooms} />
      <div className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-card md:p-6">
        <p className="text-caption text-muted-foreground">{O.description}</p>
        {data.days.length === 0 || data.roomCount === 0 ? (
          <EmptyState icon={DoorOpen} title={O.emptyTitle} description={O.emptyDescription} />
        ) : (
          <>
            <dl className="grid gap-3 sm:grid-cols-3">
              <KeyFigure label={O.overall} value={formatPercent(data.rate)} detail={O.overallHint} strong />
              <KeyFigure
                label={O.peak}
                value={data.peak ? O.peakValue(LABELS.days[data.peak.day] ?? "", data.peak.hour) : O.noPeak}
                detail={data.peak ? O.peakDetail(data.peak.rooms, data.roomCount) : null}
              />
              <KeyFigure label={O.fullHours} value={O.fullHoursValue(data.fullHours)} detail={O.fullHoursHint(data.fullHours)} />
            </dl>

            <div className="grid gap-6 xl:grid-cols-2">
              <div className="flex flex-col gap-3">
                <h3 className="font-semibold">{O.roomsTitle}</h3>
                <ul className="flex flex-col divide-y divide-divider">
                  {data.rooms.map((room) => (
                    <RoomRow key={room.roomId} room={room} openMinutes={data.openMinutes} LABELS={LABELS} />
                  ))}
                </ul>
              </div>
              <div className="flex flex-col gap-3">
                <h3 className="font-semibold">{O.heatmapTitle}</h3>
                <OccupancyHeatmap report={data} />
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function KeyFigure({ label, value, detail, strong = false }: { label: string; value: string; detail: string | null; strong?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-muted px-4 py-3">
      <dt className="text-caption font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("numeric leading-tight font-bold text-heading", strong ? "text-[2rem]" : "text-section")}>{value}</dd>
      {detail ? <dd className="text-caption text-muted-foreground">{detail}</dd> : null}
    </div>
  );
}

function RoomRow({ room, openMinutes, LABELS }: { room: RoomOccupancy; openMinutes: number; LABELS: AppLabels }) {
  const O = LABELS.roomOccupancy;
  const { icon: Icon, ink } = STATUS[room.status];
  const free = Math.max(0, openMinutes - room.usedMinutes);
  const advice =
    room.status === "saturated"
      ? room.overloaded > 0
        ? O.advice.overloaded(room.overloaded)
        : O.advice.saturated
      : room.status === "underused"
        ? O.advice.underused(hours(free))
        : O.advice.balanced;

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{room.name}</span>
          <span className="text-caption text-muted-foreground">
            {room.capacity === null ? O.capacityUnknown : LABELS.rooms.places(room.capacity)}
          </span>
        </span>
        <span className={cn("flex shrink-0 items-center gap-1 text-caption font-semibold", ink)}>
          <Icon className="size-4" aria-hidden />
          {O.status[room.status]}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(room.rate * 100)}
          aria-label={`${O.overall} — ${room.name}`}
          className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(room.rate > 0 ? 2 : 0, room.rate * 100)}%` }} />
        </div>
        <span className="numeric w-12 shrink-0 text-right text-table font-semibold">{formatPercent(room.rate)}</span>
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-caption text-muted-foreground">
        <span>{O.used(hours(room.usedMinutes), hours(openMinutes))}</span>
        {room.fill !== null ? (
          <span title={O.fillHint} className={cn(room.fill > 1 && "font-semibold text-danger-ink")}>
            {O.fill(formatPercent(room.fill))}
          </span>
        ) : null}
      </p>
      <p className="text-caption">{advice}</p>
    </li>
  );
}
