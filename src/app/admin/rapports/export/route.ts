import type { NextRequest } from "next/server";

import { LABELS } from "@/lib/constants/labels";
import { toCsv } from "@/lib/csv";
import { getReports, type ReportPeriod } from "@/lib/data/admin";
import { toISODate, today } from "@/lib/format";

const L = LABELS.admin.reports;
const PERIODS: readonly ReportPeriod[] = ["30", "90", "all"];

/** Export CSV d'un rapport : ?type=niveaux|matieres|absences&periode=30|90|all (admin uniquement). */
export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type");
  const rawPeriod = request.nextUrl.searchParams.get("periode");
  const period: ReportPeriod = PERIODS.find((value) => value === rawPeriod) ?? "30";

  // getReports vérifie le rôle administrateur.
  const reports = await getReports(period);

  let csv: string;
  switch (type) {
    case "niveaux":
      csv = toCsv(
        [L.level, L.students, L.enrollments],
        reports.byLevel.map((row) => [row.levelName, row.students, row.enrollments]),
      );
      break;
    case "matieres":
      csv = toCsv(
        [L.subject, L.level, L.enrollments, `${L.price} (MAD)`, `${L.monthlyRevenue} (MAD)`],
        reports.bySubject.map((row) => [
          row.subjectName,
          row.levelName,
          row.enrollments,
          row.monthlyPrice,
          row.monthlyRevenue,
        ]),
      );
      break;
    case "absences":
      csv = toCsv(
        [L.rank, L.subject, L.level, L.absences, L.records, `${L.rate} (%)`],
        reports.absenceRanking.map((row, index) => [
          index + 1,
          row.subjectName,
          row.levelName,
          row.absentCount,
          row.totalCount,
          Math.round(row.rate * 1000) / 10,
        ]),
      );
      break;
    default:
      return new Response(LABELS.actions.errors.invalid, { status: 400 });
  }

  const filename = `centromanager-${type}-${period}-${toISODate(today())}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
