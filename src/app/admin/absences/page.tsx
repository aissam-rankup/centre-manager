import type { Metadata } from "next";

import { AbsencesView } from "@/components/absences/absences-view";
import { AttendanceConflicts } from "@/components/attendance/attendance-conflicts";
import { SectionCard } from "@/components/shared/section-card";
import { ROUTES } from "@/lib/auth/routes";
import { getLabels } from "@/lib/i18n/server";
import { getAbsencesOn } from "@/lib/data/absences";
import { getOpenAttendanceConflicts } from "@/lib/data/sessions";
import { toISODate, today } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const LABELS = await getLabels();
  return { title: LABELS.absencesPage.title };
}

/** Appels en désaccord à trancher, puis absences du jour (ou de la date choisie, jamais dans le futur). */
export default async function AbsencesPage({ searchParams }: PageProps<"/admin/absences">) {
  const { date } = await searchParams;
  const todayIso = toISODate(today());
  const dateIso = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= todayIso ? date : todayIso;
  const [LABELS, rows, conflicts] = await Promise.all([getLabels(), getAbsencesOn(dateIso), getOpenAttendanceConflicts()]);
  const C = LABELS.attendanceConflicts;

  return (
    <div className="flex flex-col gap-6">
      {conflicts.length > 0 ? (
        <SectionCard id="desaccords" title={C.title} description={C.description}>
          <AttendanceConflicts conflicts={conflicts} fileBase={ROUTES.admin.students} />
        </SectionCard>
      ) : null}
      <AbsencesView
        rows={rows}
        dateIso={dateIso}
        todayIso={todayIso}
        basePath={ROUTES.admin.absences}
        fileBase={ROUTES.admin.students}
      />
    </div>
  );
}
