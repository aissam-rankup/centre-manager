import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { getRooms } from "@/lib/data/rooms";
import { getLabels } from "@/lib/i18n/server";

import { RoomsBoard } from "./rooms-board";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLabels()).rooms.title };
}

/** Salles du centre : capacité, équipements, occupation de la semaine. */
export default async function RoomsPage() {
  const LABELS = await getLabels();
  const rooms = await getRooms();
  const overloaded = rooms.reduce(
    (total, room) => total + (room.capacity === null ? 0 : room.slots.filter((slot) => slot.enrolled > (room.capacity ?? 0)).length),
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={LABELS.rooms.title} description={`${LABELS.rooms.description} ${LABELS.rooms.summary(rooms.length, overloaded)}.`} showTitle />
      <RoomsBoard rooms={rooms} />
    </div>
  );
}
