import { redirect } from "next/navigation";

import { ROLE_HOME, ROUTES } from "@/lib/auth/routes";
import { getAuthState } from "@/lib/auth/session";

// Le proxy oriente déjà « / » ; cette page couvre le cas où il ne s'exécute pas.
export default async function HomePage() {
  const state = await getAuthState();
  if (state.status === "anonymous") redirect(ROUTES.login);
  if (state.status === "no-profile" || !state.profile.active) redirect(ROUTES.inactive);
  redirect(ROLE_HOME[state.profile.role]);
}
