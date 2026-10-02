import { toMinutes, weekOrder } from "@/lib/rooms";

export type ConflictType = "room" | "teacher" | "level";

/** Cours existant qui bloque le créneau demandé (renvoyé par `slot_conflicts`). */
export type SlotConflict = {
  type: ConflictType;
  slotId: string;
  roomName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  teacherName: string;
  subjectName: string;
  levelName: string;
  enrolled: number;
};

/** Salle libre sur le créneau demandé. */
export type RoomSuggestion = { roomId: string; name: string; capacity: number | null; tooSmall: boolean };

/** Créneau libre pour le professeur, le niveau et une salle. */
export type TimeSuggestion = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  roomId: string;
  roomName: string;
  sameDay: boolean;
  tooSmall: boolean;
};

/** Ce que le panneau de conflit affiche : le problème, puis les issues. */
export type SlotConflictReport = {
  conflicts: SlotConflict[];
  rooms: RoomSuggestion[];
  times: TimeSuggestion[];
  /** Inscrits à la matière du créneau demandé (effectif prévu). */
  enrolled: number;
  /** Lignes du journal des conflits, à clore quand l'admin choisit une issue. */
  logIds: string[];
};

/** Résultat de l'enregistrement d'un créneau : succès, erreur, ou conflit expliqué. */
export type SlotSaveResult =
  | { ok: true; data: undefined }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; conflict?: SlotConflictReport };

export type OccupiedSlot = {
  id: string;
  levelId: string;
  teacherId: string;
  roomId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export type RoomOption = { id: string; name: string; capacity: number | null };

export type SlotRequest = {
  slotId: string | null;
  levelId: string;
  teacherId: string;
  roomId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

/** Plage d'ouverture où chercher des créneaux libres (minutes depuis minuit). */
const OPENING = 8 * 60;
const CLOSING = 23 * 60;
const STEP = 30;
const SAME_DAY_LIMIT = 3;
const OTHER_DAYS_LIMIT = 4;
const ROOMS_LIMIT = 5;

function toTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Chevauchement de deux plages en minutes, bornes exclusives comme les contraintes. */
function overlaps(start: number, end: number, other: OccupiedSlot): boolean {
  return start < toMinutes(other.endTime) && toMinutes(other.startTime) < end;
}

function tooSmall(capacity: number | null, enrolled: number): boolean {
  return capacity !== null && capacity < enrolled;
}

/** Les salles qui conviennent d'abord, puis la plus petite suffisante (on garde les grandes pour les gros groupes). */
function byFit(enrolled: number) {
  return (a: RoomOption, b: RoomOption) =>
    Number(tooSmall(a.capacity, enrolled)) - Number(tooSmall(b.capacity, enrolled)) ||
    Number(a.capacity === null) - Number(b.capacity === null) ||
    (tooSmall(a.capacity, enrolled) ? (b.capacity ?? 0) - (a.capacity ?? 0) : (a.capacity ?? 0) - (b.capacity ?? 0)) ||
    a.name.localeCompare(b.name, "fr", { numeric: true });
}

function freeRoomsAt(day: number, start: number, end: number, others: OccupiedSlot[], rooms: RoomOption[]): RoomOption[] {
  const busy = new Set(others.filter((slot) => slot.dayOfWeek === day && overlaps(start, end, slot)).map((slot) => slot.roomId));
  return rooms.filter((room) => !busy.has(room.id));
}

/** Salles actives libres sur le créneau demandé (hors salle demandée). */
export function suggestRooms(request: SlotRequest, occupied: OccupiedSlot[], rooms: RoomOption[], enrolled: number): RoomSuggestion[] {
  const others = occupied.filter((slot) => slot.id !== request.slotId);
  return freeRoomsAt(request.dayOfWeek, toMinutes(request.startTime), toMinutes(request.endTime), others, rooms)
    .filter((room) => room.id !== request.roomId)
    .sort(byFit(enrolled))
    .slice(0, ROOMS_LIMIT)
    .map((room) => ({ roomId: room.id, name: room.name, capacity: room.capacity, tooSmall: tooSmall(room.capacity, enrolled) }));
}

/**
 * Créneaux libres les plus proches, de même durée : le même jour d'abord (au plus près
 * de l'heure demandée), puis un par jour dans la semaine. Chacun est libre pour le
 * professeur et le niveau, avec une salle disponible (la salle demandée si possible).
 */
export function suggestTimes(
  request: SlotRequest,
  occupied: OccupiedSlot[],
  rooms: RoomOption[],
  enrolled: number,
  days: readonly number[],
): TimeSuggestion[] {
  const others = occupied.filter((slot) => slot.id !== request.slotId);
  const requestedStart = toMinutes(request.startTime);
  const duration = toMinutes(request.endTime) - requestedStart;
  if (duration <= 0) return [];

  const candidatesFor = (day: number): TimeSuggestion[] => {
    const daySlots = others.filter((slot) => slot.dayOfWeek === day);
    // Grille de 30 minutes, plus les fins de cours existants (enchaînements naturels).
    const starts = new Set<number>();
    for (let minute = OPENING; minute + duration <= CLOSING; minute += STEP) starts.add(minute);
    for (const slot of daySlots) {
      const end = toMinutes(slot.endTime);
      if (end >= OPENING && end + duration <= CLOSING) starts.add(end);
    }

    const result: TimeSuggestion[] = [];
    for (const start of starts) {
      if (day === request.dayOfWeek && start === requestedStart) continue;
      const end = start + duration;
      const blocked = daySlots.some(
        (slot) => (slot.teacherId === request.teacherId || slot.levelId === request.levelId) && overlaps(start, end, slot),
      );
      if (blocked) continue;
      const free = freeRoomsAt(day, start, end, others, rooms);
      const room = free.find((item) => item.id === request.roomId && !tooSmall(item.capacity, enrolled)) ?? [...free].sort(byFit(enrolled))[0];
      if (!room) continue;
      result.push({
        dayOfWeek: day,
        startTime: toTime(start),
        endTime: toTime(end),
        roomId: room.id,
        roomName: room.name,
        sameDay: day === request.dayOfWeek,
        tooSmall: tooSmall(room.capacity, enrolled),
      });
    }
    // Au plus près de l'heure demandée ; à égalité, le plus tôt.
    return result.sort(
      (a, b) =>
        Number(a.tooSmall) - Number(b.tooSmall) ||
        Math.abs(toMinutes(a.startTime) - requestedStart) - Math.abs(toMinutes(b.startTime) - requestedStart) ||
        a.startTime.localeCompare(b.startTime),
    );
  };

  const sameDay = candidatesFor(request.dayOfWeek).slice(0, SAME_DAY_LIMIT);
  const requestedOrder = weekOrder(request.dayOfWeek);
  const otherDays = days
    .filter((day) => day !== request.dayOfWeek)
    .sort((a, b) => Math.abs(weekOrder(a) - requestedOrder) - Math.abs(weekOrder(b) - requestedOrder) || weekOrder(a) - weekOrder(b))
    .flatMap((day) => candidatesFor(day).slice(0, 1))
    .slice(0, OTHER_DAYS_LIMIT);
  return [...sameDay, ...otherDays];
}
