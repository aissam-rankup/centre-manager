import "server-only";

import { createClient } from "@/lib/supabase/server";

export type SuspensionContact = { name: string | null; phone: string | null; email: string | null };

/** Contact affiché sur l'écran de suspension (réglages de la plateforme). */
export async function getSuspensionContact(): Promise<SuspensionContact> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_center_access").maybeSingle();
  if (error) throw error;
  return { name: data?.contact_name ?? null, phone: data?.contact_phone ?? null, email: data?.contact_email ?? null };
}
