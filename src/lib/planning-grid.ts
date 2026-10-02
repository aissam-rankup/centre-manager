import { toMinutes } from "@/lib/rooms";

/** Axes de lecture du planning. */
export const PLANNING_AXES = ["room", "teacher", "level"] as const;
export type PlanningAxis = (typeof PLANNING_AXES)[number];

/** Pas d'aimantation du glisser-déposer (minutes). */
export const SNAP_MINUTES = 15;

export type GridSlot = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  roomId: string;
  enrolled: number;
};

export type GridRoom = { id: string; name: string; capacity: number | null; isActive: boolean };

/** Cours placé dans sa colonne de jour : côte à côte quand ils se chevauchent. */
export type GridBlock<T> = { item: T; start: number; end: number; column: number; columns: number };

export function layoutDay<T>(items: readonly T[], range: (item: T) => readonly [number, number]): GridBlock<T>[] {
  const sorted = items
    .map((item) => {
      const [start, end] = range(item);
      return { item, start, end };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const result: GridBlock<T>[] = [];
  let cluster: GridBlock<T>[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const columns = cluster.reduce((max, block) => Math.max(max, block.column + 1), 1);
    for (const block of cluster) block.columns = columns;
    result.push(...cluster);
    cluster = [];
    clusterEnd = -1;
  };
  for (const entry of sorted) {
    // Un groupe de cours qui se chevauchent en chaîne partage la largeur de la colonne.
    if (cluster.length > 0 && entry.start >= clusterEnd) flush();
    const used = new Set(cluster.filter((block) => block.end > entry.start).map((block) => block.column));
    let column = 0;
    while (used.has(column)) column += 1;
    cluster.push({ ...entry, column, columns: 1 });
    clusterEnd = Math.max(clusterEnd, entry.end);
  }
  flush();
  return result;
}

/** Plage horaire affichée : tous les cours, une heure de marge pour pouvoir déplacer. */
export function gridRange(slots: readonly GridSlot[]): { start: number; end: number } {
  if (slots.length === 0) return { start: 9 * 60, end: 20 * 60 };
  const first = Math.min(...slots.map((slot) => toMinutes(slot.startTime)));
  const last = Math.max(...slots.map((slot) => toMinutes(slot.endTime)));
  return {
    start: Math.max(7 * 60, Math.floor(first / 60) * 60 - 60),
    end: Math.min(24 * 60, Math.ceil(last / 60) * 60 + 60),
  };
}

export function snapMinutes(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

export function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function isOverloaded(slot: GridSlot, rooms: ReadonlyMap<string, GridRoom>): boolean {
  const capacity = rooms.get(slot.roomId)?.capacity ?? null;
  return capacity !== null && slot.enrolled > capacity;
}

/**
 * Salle vide alors que la demande existe : un cours est à l'étroit dans sa salle, et une
 * autre salle active, assez grande, reste libre exactement sur ce créneau.
 * Les salles candidates sont triées de la plus petite suffisante à la plus grande.
 */
export function roomOpportunities(
  slots: readonly GridSlot[],
  rooms: readonly GridRoom[],
): { slotId: string; roomId: string }[] {
  const byId = new Map(rooms.map((room) => [room.id, room] as const));
  const candidates = rooms
    .filter((room) => room.isActive && room.capacity !== null)
    .sort((a, b) => (a.capacity ?? 0) - (b.capacity ?? 0) || a.name.localeCompare(b.name, "fr", { numeric: true }));
  const result: { slotId: string; roomId: string }[] = [];
  for (const slot of slots) {
    if (!isOverloaded(slot, byId)) continue;
    const start = toMinutes(slot.startTime);
    const end = toMinutes(slot.endTime);
    for (const room of candidates) {
      if (room.id === slot.roomId || (room.capacity ?? 0) < slot.enrolled) continue;
      const busy = slots.some(
        (other) =>
          other.id !== slot.id &&
          other.roomId === room.id &&
          other.dayOfWeek === slot.dayOfWeek &&
          toMinutes(other.startTime) < end &&
          start < toMinutes(other.endTime),
      );
      if (!busy) result.push({ slotId: slot.id, roomId: room.id });
    }
  }
  return result;
}
