"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, failure, success } from "@/lib/actions/result";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole } from "@/lib/auth/session";
import { describeCenterError, getLabels } from "@/lib/i18n/server";
import { ROOM_EQUIPMENT } from "@/lib/rooms";
import { createClient } from "@/lib/supabase/server";

async function admin() {
  const profile = await requireRole("admin");
  return { profile, supabase: await createClient() };
}

function revalidateRooms() {
  revalidatePath(ROUTES.admin.rooms);
  revalidatePath(ROUTES.admin.schedule);
}

export async function saveRoom(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const R = LABELS.rooms;
  const parsed = z
    .object({
      id: z.uuid().optional(),
      name: z.string().trim().min(1, R.nameRequired).max(40, R.nameRequired),
      capacity: z.union([z.literal(""), z.coerce.number(R.capacityInvalid).int(R.capacityInvalid).min(1, R.capacityInvalid).max(500, R.capacityInvalid)]),
      floor: z.string().trim().max(40),
      equipment: z.array(z.enum(ROOM_EQUIPMENT)),
      notes: z.string().trim().max(300),
    })
    .safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return failure(LABELS.actions.errors.invalid, fieldErrors);
  }
  const { profile, supabase } = await admin();
  const values = parsed.data;
  const row = {
    name: values.name,
    capacity: values.capacity === "" ? null : values.capacity,
    floor: values.floor || null,
    equipment: [...new Set(values.equipment)],
    notes: values.notes || null,
  };
  const { error } = values.id
    ? await supabase.from("rooms").update(row).eq("id", values.id)
    : await supabase.from("rooms").insert({ ...row, center_id: profile.centerId });
  if (error) {
    if (error.code === "23505") return failure(R.duplicate, { name: R.duplicate });
    return failure(await describeCenterError(error));
  }
  revalidateRooms();
  return success();
}

export async function setRoomActive(input: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const parsed = z.object({ id: z.uuid(), active: z.boolean() }).safeParse(input);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid);
  const { supabase } = await admin();
  const { error } = await supabase.from("rooms").update({ is_active: parsed.data.active }).eq("id", parsed.data.id);
  if (error) return failure(await describeCenterError(error));
  revalidateRooms();
  return success();
}

export async function deleteRoom(id: unknown): Promise<ActionResult> {
  const LABELS = await getLabels();
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return failure(LABELS.actions.errors.invalid);
  const { supabase } = await admin();
  const { error } = await supabase.from("rooms").delete().eq("id", parsed.data);
  if (error) return failure(error.code === "23503" ? LABELS.rooms.inUse : await describeCenterError(error));
  revalidateRooms();
  return success();
}
