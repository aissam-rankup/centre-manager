import { BarChart3, Download } from "lucide-react";
import type { Metadata } from "next";

import { FilterChips } from "@/components/admin/filter-chips";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/auth/routes";
import { LABELS } from "@/lib/constants/labels";
import {
  type AbsenceRate,
  getReports,
  type LevelReportRow,
  type ReportPeriod,
  type SubjectReportRow,
} from "@/lib/data/admin";
import { formatPercent } from "@/lib/format";

const L = LABELS.admin.reports;
const PERIODS: readonly ReportPeriod[] = ["30", "90", "all"];

export const metadata: Metadata = { title: L.title };

const LEVEL_COLUMNS: readonly DataTableColumn<LevelReportRow>[] = [
  { id: "level", header: L.level, mobile: "title", cell: (row) => <span className="font-medium">{row.levelName}</span> },
  { id: "students", header: L.students, align: "end", cell: (row) => <span className="numeric">{row.students}</span> },
  { id: "enrollments", header: L.enrollments, align: "end", cell: (row) => <span className="numeric">{row.enrollments}</span> },
];

const SUBJECT_COLUMNS: readonly DataTableColumn<SubjectReportRow>[] = [
  {
    id: "subject",
    header: L.subject,
    mobile: "title",
    cell: (row) => (
      <span className="flex flex-col">
        <span className="font-medium">{row.subjectName}</span>
        <span className="text-caption text-muted-foreground md:hidden">{row.levelName}</span>
      </span>
    ),
  },
  { id: "level", header: L.level, mobile: "hidden", cell: (row) => row.levelName },
  { id: "enrollments", header: L.enrollments, align: "end", cell: (row) => <span className="numeric">{row.enrollments}</span> },
  { id: "price", header: L.price, align: "end", cell: (row) => <Money amount={row.monthlyPrice} /> },
  {
    id: "revenue",
    header: L.monthlyRevenue,
    align: "end",
    cell: (row) => <Money amount={row.monthlyRevenue} />,
  },
];

type RankedRate = AbsenceRate & { rank: number };

const ABSENCE_COLUMNS: readonly DataTableColumn<RankedRate>[] = [
  { id: "rank", header: L.rank, mobile: "hidden", cell: (row) => <span className="numeric">{row.rank}</span> },
  {
    id: "subject",
    header: L.subject,
    mobile: "title",
    cell: (row) => (
      <span className="flex flex-col">
        <span className="font-medium">
          <span className="numeric md:hidden">{row.rank}. </span>
          {row.subjectName}
        </span>
        <span className="text-caption text-muted-foreground md:hidden">{row.levelName}</span>
      </span>
    ),
  },
  { id: "level", header: L.level, mobile: "hidden", cell: (row) => row.levelName },
  { id: "absences", header: L.absences, align: "end", cell: (row) => <span className="numeric font-normal">{row.absentCount}</span> },
  { id: "records", header: L.records, align: "end", cell: (row) => <span className="numeric font-normal">{row.totalCount}</span> },
  { id: "rate", header: L.rate, align: "end", mobile: "aside", cell: (row) => <span className="numeric">{formatPercent(row.rate)}</span> },
];

function ExportButton({ type, period }: { type: string; period: ReportPeriod }) {
  return (
    <Button asChild variant="outline">
      <a href={`${ROUTES.admin.reports}/export?type=${type}&periode=${period}`} download>
        <Download aria-hidden />
        {L.export}
      </a>
    </Button>
  );
}

export default async function AdminReportsPage({ searchParams }: PageProps<"/admin/rapports">) {
  const params = await searchParams;
  const period: ReportPeriod = PERIODS.find((value) => value === params.periode) ?? "30";
  const reports = await getReports(period);
  const ranking: RankedRate[] = reports.absenceRanking
    .filter((row) => row.totalCount > 0)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={L.title} description={L.description} />

      {reports.byLevel.length === 0 ? (
        <EmptyState icon={BarChart3} title={L.emptyTitle} description={L.emptyDescription} />
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard id="niveaux" title={L.byLevel} aside={<ExportButton type="niveaux" period={period} />}>
              <DataTable columns={LEVEL_COLUMNS} rows={reports.byLevel} getRowId={(row) => row.levelId} caption={L.byLevel} variant="plain" />
            </SectionCard>
            <SectionCard id="matieres" title={L.bySubject} aside={<ExportButton type="matieres" period={period} />}>
              <DataTable columns={SUBJECT_COLUMNS} rows={reports.bySubject} getRowId={(row) => row.subjectId} caption={L.bySubject} variant="plain" />
            </SectionCard>
          </div>

          <SectionCard
            id="absences"
            title={L.absenceRanking}
            description={L.absenceRankingHint}
            aside={<ExportButton type="absences" period={period} />}
          >
            <FilterChips
              label={L.period}
              current={period}
              options={PERIODS.map((value) => ({ value, label: L.periods[value] ?? value }))}
              href={(value) => `${ROUTES.admin.reports}?periode=${value ?? "30"}#absences`}
            />
            {ranking.length === 0 ? (
              <EmptyState icon={BarChart3} title={L.emptyTitle} description={L.emptyDescription} />
            ) : (
              <DataTable columns={ABSENCE_COLUMNS} rows={ranking} getRowId={(row) => row.subjectId} caption={L.absenceRanking} variant="plain" />
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
