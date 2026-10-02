import "server-only";

import { requireRole } from "@/lib/auth/session";
import { type OccupancyReport, roomOccupancy } from "@/lib/room-occupancy";
import { parseEquipment, type RoomView, toMinutes, weekOrder } from "@/lib/rooms";
import { createClient } from "@/lib/supabase/server";

/** Salles du centre et leurs cours de la semaine (admin). */
export async function getRooms(): Promise<RoomView[]> {
  await requireRole("admin");
  const supabase = await createClient();

  const [rooms, slots, enrollments] = await Promise.all([
    supabase.from("rooms").select("id, name, capacity, floor, equipment, is_active, notes").order("name"),
    supabase
      .from("schedule_slots")
      .select("id, room_id, day_of_week, start_time, end_time, subject_id, subjects(name), levels(name), profiles(full_name)"),
    supabase.from("enrollments").select("subject_id").eq("active", true),
  ]);
  if (rooms.error) throw rooms.error;
  if (slots.error) throw slots.error;
  if (enrollments.error) throw enrollments.error;

  const enrolledBySubject = new Map<string, number>();
  for (const row of enrollments.data) enrolledBySubject.set(row.subject_id, (enrolledBySubject.get(row.subject_id) ?? 0) + 1);

  return rooms.data
    .map((room) => {
      const roomSlots = slots.data
        .filter((slot) => slot.room_id === room.id)
        .map((slot) => ({
          id: slot.id,
          dayOfWeek: slot.day_of_week,
          startTime: slot.start_time.slice(0, 5),
          endTime: slot.end_time.slice(0, 5),
          subjectName: slot.subjects?.name ?? "",
          levelName: slot.levels?.name ?? "",
          teacherName: slot.profiles?.full_name ?? "",
          enrolled: enrolledBySubject.get(slot.subject_id) ?? 0,
        }))
        .sort((a, b) => weekOrder(a.dayOfWeek) - weekOrder(b.dayOfWeek) || a.startTime.localeCompare(b.startTime));
      const minutes = roomSlots.reduce((total, slot) => total + toMinutes(slot.endTime) - toMinutes(slot.startTime), 0);
      return {
        id: room.id,
        name: room.name,
        capacity: room.capacity,
        floor: room.floor,
        equipment: parseEquipment(room.equipment),
        isActive: room.is_active,
        notes: room.notes,
        slots: roomSlots,
        weeklyHours: Math.round((minutes / 60) * 10) / 10,
      };
    })
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, "fr", { numeric: true }));
}

/** Taux d'occupation des salles sur la semaine type (tableau de bord admin). */
export async function getRoomOccupancy(): Promise<OccupancyReport> {
  const rooms = await getRooms();
  return roomOccupancy(
    rooms.flatMap((room) => room.slots.map((slot) => ({ roomId: room.id, ...slot }))),
    rooms,
  );
}
