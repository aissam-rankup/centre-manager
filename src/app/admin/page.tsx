import { TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import { z } from "zod";

import { AbsenceChart } from "@/components/admin/absence-chart";
import { CollectionOverviewSection, LateDraftBanner, ReenrollmentOverviewCard } from "@/components/admin/collection-overview";
import { DiscountsOverview, FinanceOverview } from "@/components/admin/finance-overview";
import { FilterChips } from "@/components/admin/filter-chips";
import { RoomOccupancyOverview } from "@/components/admin/room-occupancy";
import { ProgressRing, ProgressTile } from "@/components/dashboard/progress-tile";
import { ReminderCard } from "@/components/dashboard/reminder-card";
import { SectionHeading } from "@/components/dashboard/section-heading";
import { StatTile, StatTiles } from "@/components/dashboard/stat-tile";
import { StudentBoard } from "@/components/dashboard/student-board";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { ROUTES } from "@/lib/auth/routes";
import { getLabels } from "@/lib/i18n/server";
import { getAdminDashboard } from "@/lib/data/admin";
import { getCollectionOverview, getLateDraft, getReenrollmentOverview } from "@/lib/data/collection";
import { getFinancialDashboard } from "@/lib/data/finance";
import { getRoomOccupancy } from "@/lib/data/rooms";
import { formatMAD, formatMonth, formatPercent } from "@/lib/format";


export async function generateMetadata(): Promise<Metadata> {
  const LABELS = await getLabels();
  const L = LABELS.admin.dashboard;
  return { title: L.title };
}

export default async function AdminDashboardPage({ searchParams }: PageProps<"/admin">) {
  const LABELS = await getLabels();
  const L = LABELS.admin.dashboard;
  const D = LABELS.dashboard;
  const params = await searchParams;
  const raw = typeof params.niveau === "string" ? params.niveau : null;
  const requestedLevel = raw && z.uuid().safeParse(raw).success ? raw : null;
  const filtered = await getAdminDashboard(requestedLevel);
  // Filtre ignoré s'il ne correspond à aucun niveau du centre.
  const levelId = filtered.levels.some((level) => level.id === requestedLevel) ? requestedLevel : null;
  const data = requestedLevel && !levelId ? await getAdminDashboard(null) : filtered;
  // Finances : tout le centre, jamais en mode support.
  const [finance, occupancy, collection, reenrollment, lateDraft] = await Promise.all([
    getFinancialDashboard(),
    getRoomOccupancy(),
    getCollectionOverview(),
    getReenrollmentOverview(),
    getLateDraft(),
  ]);

  const gap = Math.max(0, data.expected - data.collected);
  const gapRatio = data.expected > 0 ? gap / data.expected : 0;

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
      {/* Colonne principale */}
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader title={L.title} description={L.description(formatMonth(`${data.monthStart}`))} />

        {lateDraft ? <LateDraftBanner draft={lateDraft} LABELS={LABELS} /> : null}

        <FilterChips
          label={L.filterLabel}
          current={levelId}
          options={[{ value: null, label: L.allLevels }, ...data.levels.map((level) => ({ value: level.id, label: level.name }))]}
          href={(value) => (value ? `${ROUTES.admin.home}?niveau=${value}` : ROUTES.admin.home)}
        />

        <section aria-labelledby="statistiques" className="flex flex-col gap-3">
          <SectionHeading id="statistiques" title={D.statsTitle} href={ROUTES.admin.reports} />
          <StatTiles>
            <StatTile
              value={data.studentCount}
              label={L.stats.activeStudents}
              detail={levelId ? L.stats.studentsHintLevel : L.stats.studentsHint}
              links={[{ href: ROUTES.admin.students, label: D.detail }]}
            />
            <StatTile
              value={formatMAD(data.collected)}
              label={L.stats.collectedMonth}
              detail={L.stats.collectedHint(data.paidCount, data.invoiceCount)}
              links={[{ href: ROUTES.admin.reports, label: D.detail }]}
            />
            <StatTile
              value={formatMAD(gap)}
              label={L.stats.shortfall}
              detail={L.stats.shortfallDetail(formatPercent(gapRatio), formatMAD(data.expected))}
              links={[{ href: `${ROUTES.admin.students}?statut=retard`, label: D.detail }]}
            />
          </StatTiles>
        </section>

        {collection ? <CollectionOverviewSection data={collection} LABELS={LABELS} /> : null}

        {finance ? <FinanceOverview data={finance} LABELS={LABELS} /> : null}

        <RoomOccupancyOverview data={occupancy} LABELS={LABELS} />

        <StudentBoard students={data.students} fileBase={ROUTES.admin.students} seeAllHref={ROUTES.admin.students} />

        <section aria-labelledby="absences" className="flex flex-col gap-3">
          <SectionHeading id="absences" title={L.chart.title} href={`${ROUTES.admin.reports}#absences`} />
          <div className="rounded-xl bg-card p-5 shadow-card md:p-6">
            <p className="mb-4 text-caption text-muted-foreground">{L.chart.description}</p>
            {data.absenceRates.length === 0 ? (
              <EmptyState icon={TrendingUp} title={L.chart.emptyTitle} description={L.chart.emptyDescription} />
            ) : (
              <AbsenceChart rates={data.absenceRates} />
            )}
          </div>
        </section>
      </div>

      {/* Colonne droite : sous le contenu jusqu'à 1024 px, en grille de 2 sur tablette */}
      <aside className="flex flex-col gap-6" aria-label={D.reminder.title}>
        {reenrollment ? <ReenrollmentOverviewCard data={reenrollment} LABELS={LABELS} /> : null}

        {finance ? <DiscountsOverview data={finance} LABELS={LABELS} /> : null}

        <section aria-labelledby="rappel" className="flex flex-col gap-3">
          <SectionHeading id="rappel" title={D.reminder.title} href={`${ROUTES.admin.students}?statut=retard`} />
          <ReminderCard
            title={D.reminder.cardTitle}
            description={D.reminder.cardDescription(data.followUpsToday)}
            href={`${ROUTES.admin.students}?statut=retard`}
            linkLabel={D.reminder.link}
          />
        </section>

        <section aria-labelledby="presences" className="flex flex-col gap-3">
          <SectionHeading id="presences" title={D.presence.title} href={`${ROUTES.admin.reports}#absences`} />
          {data.presence.length === 0 ? (
            <EmptyState icon={TrendingUp} title={D.presence.emptyTitle} description={D.presence.emptyDescription} />
          ) : (
            <div className="stagger grid gap-3 md:grid-cols-2 lg:grid-cols-1">
              {data.presence.map((subject, index) => (
                <ProgressTile
                  key={subject.subjectId}
                  index={index}
                  ring={<ProgressRing value={subject.rate} caption={D.presence.ring} />}
                  title={subject.subjectName}
                  description={D.presence.detail(subject.levelName, subject.students)}
                  href={`${ROUTES.admin.reports}#absences`}
                  linkLabel={D.presence.link}
                />
              ))}
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
