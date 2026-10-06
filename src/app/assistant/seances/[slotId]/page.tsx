import { ArrowLeft, SearchX, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/components/shared/app-link";
import { z } from "zod";

import { SessionRosterForm } from "@/components/sessions/session-roster-form";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/auth/routes";
import { getSessionRoster, parseSessionDate } from "@/lib/data/sessions";
import { formatDateWithWeekday } from "@/lib/format";
import { getLabels } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLabels()).sessions.take };
}

/** Appel d'une séance par l'accueil (aujourd'hui ou les 7 derniers jours). */
export default async function AssistantSessionPage({ params, searchParams }: PageProps<"/assistant/seances/[slotId]">) {
  const LABELS = await getLabels();
  const L = LABELS.sessions.roster;
  const { slotId } = await params;
  const { date } = await searchParams;
  const dateIso = parseSessionDate(date);
  // Date hors de la fenêtre : pas de repli silencieux sur aujourd'hui.
  const requested = typeof date === "string" ? date : dateIso;
  const roster = z.uuid().safeParse(slotId).success && requested === dateIso ? await getSessionRoster(slotId, dateIso) : null;
  const backHref = `${ROUTES.assistant.sessions}?date=${dateIso}`;

  const back = (
    <Button asChild variant="ghost" className="-ml-3 self-start">
      <Link href={backHref}>
        <ArrowLeft aria-hidden />
        {L.back}
      </Link>
    </Button>
  );

  if (!roster) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        <EmptyState icon={SearchX} title={L.notFoundTitle} description={L.notFoundDescription} />
      </div>
    );
  }

  const { session } = roster;
  const dayLabel = formatDateWithWeekday(dateIso);
  return (
    <div className="flex flex-col gap-6">
      {back}
      <PageHeader
        showTitle
        title={`${session.subjectName} · ${session.startTime} – ${session.endTime}`}
        description={`${dayLabel.charAt(0).toUpperCase()}${dayLabel.slice(1)} · ${session.levelName} · ${session.room}${
          session.teacherName ? ` · ${L.teacherOf(session.teacherName)}` : ""
        }`}
      />
      <p className="text-caption text-muted-foreground">{L.description}</p>
      {roster.students.length === 0 ? (
        <EmptyState icon={Users} title={L.emptyTitle} description={L.emptyDescription} />
      ) : (
        <SessionRosterForm slotId={session.slotId} date={dateIso} students={roster.students} backHref={backHref} />
      )}
    </div>
  );
}
