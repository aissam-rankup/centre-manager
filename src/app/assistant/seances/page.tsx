import type { Metadata } from "next";

import { DaySessions } from "@/components/sessions/day-sessions";
import { ROUTES } from "@/lib/auth/routes";
import { getDaySessions, parseSessionDate, sessionWindow, shiftIsoDate } from "@/lib/data/sessions";
import { getLabels } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLabels()).sessions.title };
}

/** Séances du jour (ou des 7 derniers jours) : l'accueil fait l'appel en secours du professeur. */
export default async function AssistantSessionsPage({ searchParams }: PageProps<"/assistant/seances">) {
  const { date } = await searchParams;
  const dateIso = parseSessionDate(date);
  const { min, max } = sessionWindow();
  const sessions = await getDaySessions(dateIso);

  return (
    <DaySessions
      sessions={sessions}
      dateIso={dateIso}
      todayIso={max}
      previous={dateIso > min ? shiftIsoDate(dateIso, -1) : null}
      next={dateIso < max ? shiftIsoDate(dateIso, 1) : null}
      basePath={ROUTES.assistant.sessions}
      sessionHref={ROUTES.assistant.session}
    />
  );
}
