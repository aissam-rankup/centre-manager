"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { type ActionResult, describeDatabaseError, failure } from "@/lib/actions/result";
import { ROUTES } from "@/lib/auth/routes";
import { getAuthState, requireSuperAdmin } from "@/lib/auth/session";
import { LABELS } from "@/lib/constants/labels";
import { createClient } from "@/lib/supabase/server";

const startSchema = z.object({
  centerId: z.uuid(),
  reason: z.string().trim().min(1, LABELS.platform.validation.reasonRequired).max(300),
});

/** Ouvre une session de support (1 h, lecture seule, journalisée), puis l'espace administration du centre. */
export async function startSupport(input: unknown): Promise<ActionResult> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? LABELS.actions.errors.invalid);
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_start_support", {
    p_center_id: parsed.data.centerId,
    p_reason: parsed.data.reason,
  });
  if (error) return failure(describeDatabaseError(error));
  revalidatePath("/", "layout");
  redirect(ROUTES.admin.home);
}

/** Ferme la session de support et revient à la fiche du centre dans la console. */
export async function endSupport(): Promise<void> {
  const state = await getAuthState();
  const centerId = state.status === "authenticated" && state.profile.support ? state.profile.centerId : null;
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_end_support");
  if (error) throw error;
  revalidatePath("/", "layout");
  redirect(centerId ? `${ROUTES.platform.centers}/${centerId}` : ROUTES.platform.home);
}
