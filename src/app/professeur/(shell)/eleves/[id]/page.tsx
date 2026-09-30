import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AttendanceSheet } from "@/components/attendance/attendance-sheet";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { parseAttendanceFilters } from "@/lib/attendance";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole } from "@/lib/auth/session";
import { getAttendanceData } from "@/lib/data/attendance";
import { getLabels } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLabels()).attendanceSheet.title };
}

/** Assiduité d'un élève, limitée aux matières du professeur (filtrage en base). */
export default async function TeacherStudentAttendancePage({ params, searchParams }: PageProps<"/professeur/eleves/[id]">) {
  await requireRole("teacher");
  const LABELS = await getLabels();
  const L = LABELS.attendanceSheet;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await getAttendanceData(id);
  // Élève hors des matières du professeur : aucune séance visible, pas de fiche.
  if (!data.student || data.records.length === 0) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" className="-ml-3 self-start">
        <Link href={ROUTES.teacher.home}>
          <ArrowLeft aria-hidden />
          {LABELS.common.back}
        </Link>
      </Button>
      <PageHeader title={`${L.title} — ${data.student.fullName}`} description={data.student.levelName} showTitle />
      <AttendanceSheet
        data={data}
        filters={parseAttendanceFilters(await searchParams)}
        basePath={ROUTES.teacher.student(id)}
        teacherScope
      />
    </div>
  );
}
