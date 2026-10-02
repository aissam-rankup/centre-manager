import { toMinutes, weekOrder } from "@/lib/rooms";

/**
 * Taux d'occupation des salles.
 *
 * Heures d'ouverture : chaque jour de cours, du début du premier cours à la fin du
 * dernier, tout le centre confondu. Une salle occupée sur toute cette plage est à
 * 100 %. Le remplissage compare les inscrits aux places pendant ses cours.
 */

/** Au-delà, la salle est saturée ; en deçà, sous-utilisée. */
export const SATURATED_FROM = 0.8;
export const UNDERUSED_BELOW = 0.3;

export type OccupancySlot = { roomId: string; dayOfWeek: number; startTime: string; endTime: string; enrolled: number };
export type OccupancyRoom = { id: string; name: string; capacity: number | null; isActive: boolean };

export type RoomStatus = "saturated" | "balanced" | "underused";

export type RoomOccupancy = {
  roomId: string;
  name: string;
  capacity: number | null;
  /** Part des heures d'ouverture où la salle a cours (0 à 1). */
  rate: number;
  usedMinutes: number;
  /** Inscrits / places pendant ses cours (null : capacité inconnue ou aucun cours). */
  fill: number | null;
  /** Cours dont l'effectif dépasse la capacité. */
  overloaded: number;
  status: RoomStatus;
};

/** Case de la carte de chaleur : part des salles occupées pendant cette heure (hors ouverture : `open` faux). */
export type OccupancyCell = { day: number; hour: number; rate: number; rooms: number; open: boolean };

export type OccupancyReport = {
  rooms: RoomOccupancy[];
  /** Heures d'ouverture de la semaine, en minutes (par salle). */
  openMinutes: number;
  /** Toutes salles confondues (0 à 1). */
  rate: number;
  days: number[];
  hours: number[];
  cells: OccupancyCell[];
  /** Heure la plus chargée (null : aucun cours). */
  peak: OccupancyCell | null;
  /** Heures où toutes les salles sont occupées. */
  fullHours: number;
  roomCount: number;
};

function overlap(start: number, end: number, from: number, to: number): number {
  return Math.max(0, Math.min(end, to) - Math.max(start, from));
}

export function roomOccupancy(slots: readonly OccupancySlot[], allRooms: readonly OccupancyRoom[]): OccupancyReport {
  // Salles prises en compte : actives, ou désactivées mais portant encore des cours.
  const rooms = allRooms.filter((room) => room.isActive || slots.some((slot) => slot.roomId === room.id));
  const roomIds = new Set(rooms.map((room) => room.id));
  const timed = slots
    .filter((slot) => roomIds.has(slot.roomId))
    .map((slot) => ({ ...slot, start: toMinutes(slot.startTime), end: toMinutes(slot.endTime) }))
    .filter((slot) => slot.end > slot.start);

  const days = [...new Set(timed.map((slot) => slot.dayOfWeek))].sort((a, b) => weekOrder(a) - weekOrder(b));
  const windows = new Map(
    days.map((day) => {
      const daySlots = timed.filter((slot) => slot.dayOfWeek === day);
      return [day, { from: Math.min(...daySlots.map((slot) => slot.start)), to: Math.max(...daySlots.map((slot) => slot.end)) }] as const;
    }),
  );
  const openMinutes = [...windows.values()].reduce((total, window) => total + window.to - window.from, 0);

  const perRoom: RoomOccupancy[] = rooms.map((room) => {
    const own = timed.filter((slot) => slot.roomId === room.id);
    const usedMinutes = own.reduce((total, slot) => total + slot.end - slot.start, 0);
    const seatMinutes = room.capacity === null ? 0 : usedMinutes * room.capacity;
    const enrolledMinutes = own.reduce((total, slot) => total + slot.enrolled * (slot.end - slot.start), 0);
    const overloaded = room.capacity === null ? 0 : own.filter((slot) => slot.enrolled > (room.capacity ?? 0)).length;
    const rate = openMinutes > 0 ? Math.min(1, usedMinutes / openMinutes) : 0;
    const status: RoomStatus = rate >= SATURATED_FROM || overloaded > 0 ? "saturated" : rate < UNDERUSED_BELOW ? "underused" : "balanced";
    return {
      roomId: room.id,
      name: room.name,
      capacity: room.capacity,
      rate,
      usedMinutes,
      fill: seatMinutes > 0 ? enrolledMinutes / seatMinutes : null,
      overloaded,
      status,
    };
  });

  // Carte de chaleur : heures pleines, de la première heure d'ouverture à la dernière.
  const first = Math.min(...[...windows.values()].map((window) => window.from));
  const last = Math.max(...[...windows.values()].map((window) => window.to));
  const hours: number[] = [];
  if (days.length > 0) for (let hour = Math.floor(first / 60); hour * 60 < last; hour += 1) hours.push(hour);

  const cells: OccupancyCell[] = days.flatMap((day) =>
    hours.map((hour) => {
      const from = hour * 60;
      const to = from + 60;
      const opening = windows.get(day);
      const daySlots = timed.filter((slot) => slot.dayOfWeek === day && slot.start < to && from < slot.end);
      const minutes = daySlots.reduce((total, slot) => total + overlap(slot.start, slot.end, from, to), 0);
      return {
        day,
        hour,
        rate: rooms.length > 0 ? Math.min(1, minutes / (rooms.length * 60)) : 0,
        rooms: new Set(daySlots.map((slot) => slot.roomId)).size,
        open: opening ? overlap(opening.from, opening.to, from, to) > 0 : false,
      };
    }),
  );
  const peak = cells.reduce<OccupancyCell | null>((best, cell) => (cell.rate > 0 && (!best || cell.rate > best.rate) ? cell : best), null);
  const used = perRoom.reduce((total, room) => total + room.usedMinutes, 0);

  return {
    rooms: perRoom.sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name, "fr", { numeric: true })),
    openMinutes,
    rate: openMinutes > 0 && rooms.length > 0 ? Math.min(1, used / (openMinutes * rooms.length)) : 0,
    days,
    hours,
    cells,
    peak,
    fullHours: cells.filter((cell) => cell.rate >= 0.999).length,
    roomCount: rooms.length,
  };
}

/** Palier de couleur de la carte de chaleur : 0 (vide) puis 1 à 5. */
export function occupancyStep(rate: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (rate <= 0) return 0;
  if (rate < 0.25) return 1;
  if (rate < 0.5) return 2;
  if (rate < 0.75) return 3;
  if (rate < 0.999) return 4;
  return 5;
}
