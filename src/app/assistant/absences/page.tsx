import type { Metadata } from "next";

import { AbsencesView } from "@/components/absences/absences-view";
import { ROUTES } from "@/lib/auth/routes";
import { getLabels } from "@/lib/i18n/server";
import { getAbsencesOn } from "@/lib/data/absences";
import { toISODate, today } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const LABELS = await getLabels();
  return { title: LABELS.absencesPage.title };
}

/** Absences du jour (ou de la date choisie, jamais dans le futur). */
export default async function AbsencesPage({ searchParams }: PageProps<"/assistant/absences">) {
  const { date } = await searchParams;
  const todayIso = toISODate(today());
  const dateIso = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= todayIso ? date : todayIso;
  const rows = await getAbsencesOn(dateIso);

  return (
    <AbsencesView
      rows={rows}
      dateIso={dateIso}
      todayIso={todayIso}
      basePath={ROUTES.assistant.absences}
      fileBase={ROUTES.assistant.students}
    />
  );
}
