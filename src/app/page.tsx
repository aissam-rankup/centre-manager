import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Vitrine } from "@/components/vitrine/vitrine";
import { ROLE_HOME, ROUTES } from "@/lib/auth/routes";
import { getAuthState } from "@/lib/auth/session";
import { getCurrentCenter } from "@/lib/branding";
import { getLocale } from "@/lib/i18n/request-locale";
import { VITRINE } from "@/lib/vitrine/content";

/** Vitrine (domaine racine, visiteur non connecté) : titre et description dans la langue choisie. */
export async function generateMetadata(): Promise<Metadata> {
  const t = VITRINE[await getLocale()].meta;
  return { title: { absolute: t.title }, description: t.description, openGraph: { title: t.title, description: t.description } };
}

// Domaine racine sans session : la vitrine. Adresse d'un centre : son écran de connexion.
// Le proxy oriente déjà les comptes connectés ; cette page couvre le cas où il ne s'exécute pas.
export default async function HomePage() {
  const state = await getAuthState();
  if (state.status === "anonymous") {
    if (await getCurrentCenter()) redirect(ROUTES.login);
    return <Vitrine locale={await getLocale()} />;
  }
  if (state.status === "student") redirect(state.student.mustChangePassword ? ROUTES.forcedPassword : ROUTES.student.home);
  if (state.status === "no-profile" || !state.profile.active) redirect(ROUTES.inactive);
  if (state.profile.mustChangePassword) redirect(ROUTES.forcedPassword);
  redirect(ROLE_HOME[state.profile.role]);
}
