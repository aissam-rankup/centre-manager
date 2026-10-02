import type { Json } from "@/lib/supabase/database.types";

/** Équipements proposés (codes enregistrés en base). */
export const ROOM_EQUIPMENT = ["whiteboard", "projector", "screen", "computers", "speakers", "air_conditioning"] as const;
export type RoomEquipment = (typeof ROOM_EQUIPMENT)[number];

export function parseEquipment(value: Json): RoomEquipment[] {
  if (!Array.isArray(value)) return [];
  return ROOM_EQUIPMENT.filter((code) => value.includes(code));
}

export type RoomSlot = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  subjectName: string;
  levelName: string;
  teacherName: string;
  /** Inscrits actifs à la matière (packs compris). */
  enrolled: number;
};

export type RoomView = {
  id: string;
  name: string;
  capacity: number | null;
  floor: string | null;
  equipment: RoomEquipment[];
  isActive: boolean;
  notes: string | null;
  slots: RoomSlot[];
  /** Heures de cours par semaine. */
  weeklyHours: number;
};

/** Minutes depuis minuit (« 17:30 » → 1050). */
export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** Ordre des jours à l'écran : lundi d'abord, dimanche en dernier. */
export function weekOrder(day: number): number {
  return day === 0 ? 7 : day;
}
