import { CircleCheck, Hourglass, TrendingUp, Users } from "lucide-react";
import type { Metadata } from "next";
import { z } from "zod";

import { AbsenceChart } from "@/components/admin/absence-chart";
import { FilterChips } from "@/components/admin/filter-chips";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { ROUTES } from "@/lib/auth/routes";
import { LABELS } from "@/lib/constants/labels";
import { getAdminDashboard } from "@/lib/data/admin";
import { formatMonth, formatPercent } from "@/lib/format";

const L = LABELS.admin.dashboard;

export const metadata: Metadata = { title: L.title };

export default async function AdminDashboardPage({ searchParams }: PageProps<"/admin">) {
  const params = await searchParams;
  const raw = typeof params.niveau === "string" ? params.niveau : null;
  const requestedLevel = raw && z.uuid().safeParse(raw).success ? raw : null;
  const filtered = await getAdminDashboard(requestedLevel);
  // Filtre ignoré s'il ne correspond à aucun niveau du centre.
  const levelId = filtered.levels.some((level) => level.id === requestedLevel) ? requestedLevel : null;
  const data = requestedLevel && !levelId ? await getAdminDashboard(null) : filtered;

  const gap = Math.max(0, data.expected - data.collected);
  const gapRatio = data.expected > 0 ? gap / data.expected : 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={L.title} description={L.description(formatMonth(`${data.monthStart}`))} />

      <FilterChips
        label={L.filterLabel}
        current={levelId}
        options={[{ value: null, label: L.allLevels }, ...data.levels.map((level) => ({ value: level.id, label: level.name }))]}
        href={(value) => (value ? `${ROUTES.admin.home}?niveau=${value}` : ROUTES.admin.home)}
      />

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <StatCard
          label={L.stats.collected}
          value={<Money amount={data.collected} />}
          icon={CircleCheck}
          tone="success"
          hint={L.stats.collectedHint(data.paidCount, data.invoiceCount)}
        />
        <StatCard
          label={L.stats.expected}
          value={<Money amount={data.expected} />}
          icon={TrendingUp}
          tone="brand"
          hint={L.stats.expectedHint}
        />
        <StatCard
          label={L.stats.gap}
          value={<Money amount={gap} />}
          icon={Hourglass}
          tone="danger"
          hint={L.stats.gapHint(formatPercent(gapRatio))}
        />
        <StatCard
          label={L.stats.students}
          value={data.studentCount}
          icon={Users}
          tone="primary"
          hint={levelId ? L.stats.studentsHintLevel : L.stats.studentsHint}
        />
      </div>

      <SectionCard id="absences" title={L.chart.title} description={L.chart.description}>
        {data.absenceRates.length === 0 ? (
          <EmptyState icon={TrendingUp} title={L.chart.emptyTitle} description={L.chart.emptyDescription} />
        ) : (
          <AbsenceChart rates={data.absenceRates} />
        )}
      </SectionCard>
    </div>
  );
}
