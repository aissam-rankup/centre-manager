import type { ReactNode } from "react";

import { requireRole } from "@/lib/auth/session";

// Garde de l'espace professeur. La coque applicative est dans (shell) :
// le mode appel (phase 5) s'affiche en plein écran, hors de ce groupe.
export default async function TeacherLayout({ children }: { children: ReactNode }) {
  await requireRole("teacher");
  return children;
}
