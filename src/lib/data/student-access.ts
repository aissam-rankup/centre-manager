import "server-only";

import { requireStaff } from "@/lib/auth/session";
import { getLastPasswordResets, type LastPasswordReset } from "@/lib/data/passwords";
import { createClient } from "@/lib/supabase/server";

export type StudentAccess = {
  status: "none" | "active" | "inactive";
  code: string | null;
  createdAt: string | null;
  deactivatedAt: string | null;
  /** Dernière réinitialisation du mot de passe (visible de l'administrateur). */
  lastPasswordReset: LastPasswordReset | null;
};

/** Accès élève d'une fiche (accueil, admin), ou null sans la plateforme pédagogique. */
export async function getStudentAccess(studentId: string): Promise<StudentAccess | null> {
  const profile = await requireStaff();
  if (!profile.modules.includes("lms")) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_accounts")
    .select("user_id, login_code, active, created_at, deactivated_at")
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { status: "none", code: null, createdAt: null, deactivatedAt: null, lastPasswordReset: null };
  const resets = await getLastPasswordResets(supabase, [data.user_id]);
  return {
    status: data.active ? "active" : "inactive",
    code: data.login_code,
    createdAt: data.created_at,
    deactivatedAt: data.deactivated_at,
    lastPasswordReset: resets.get(data.user_id) ?? null,
  };
}
