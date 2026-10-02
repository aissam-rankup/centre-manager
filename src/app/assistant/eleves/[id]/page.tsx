import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { DiscountsPanel } from "@/components/discounts/discounts-panel";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/auth/routes";
import { getLabels } from "@/lib/i18n/server";
import {
  FollowUpsSection,
  PaymentsSection,
  StudentHeader,
  SubjectsSection,
} from "@/components/students/student-file-sections";
import { StudentTabs } from "@/components/students/student-tabs";
import { ReceiptsSection } from "@/components/receipts/receipts-section";
import { getStudentReceipts } from "@/lib/data/receipts";
import { AttendanceSheet } from "@/components/attendance/attendance-sheet";
import { parseAttendanceFilters } from "@/lib/attendance";
import { getAttendanceData } from "@/lib/data/attendance";
import { getStudentFile, type StudentFile } from "@/lib/data/assistant";
import { toISODate, today } from "@/lib/format";

async function loadStudent(id: string): Promise<StudentFile> {
  if (!z.uuid().safeParse(id).success) notFound();
  const student = await getStudentFile(id);
  if (!student) notFound();
  return student;
}

export async function generateMetadata({ params }: PageProps<"/assistant/eleves/[id]">): Promise<Metadata> {
  const { id } = await params;
  const student = z.uuid().safeParse(id).success ? await getStudentFile(id) : null;
  return { title: student?.fullName ?? (await getLabels()).assistant.student.notFoundTitle };
}

export default async function StudentFilePage({ params, searchParams }: PageProps<"/assistant/eleves/[id]">) {
  const LABELS = await getLabels();
  const L = LABELS.assistant.student;
  const T = L.tabs;
  const { id } = await params;
  const query = await searchParams;
  const filters = parseAttendanceFilters(query);
  const tab = typeof query.onglet === "string" ? query.onglet : undefined;
  const student = await loadStudent(id);
  const receipts = await getStudentReceipts(student.id);

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" className="-ml-3 self-start">
        <Link href={ROUTES.assistant.students}>
          <ArrowLeft aria-hidden />
          {L.back}
        </Link>
      </Button>

      <StudentHeader student={student} />

      <SubjectsSection student={student} />

      {student.discounts.length > 0 ? (
        <DiscountsPanel
          studentId={student.id}
          discounts={student.discounts}
          canEdit={false}
          targets={[]}
          todayIso={toISODate(today())}
        />
      ) : null}

      <StudentTabs
        defaultValue={tab}
        panels={[
          { value: "paiements", label: T.payments, count: student.invoices.length, content: <PaymentsSection student={student} /> },
          { value: "recus", label: T.receipts, count: receipts.length, content: (
              <ReceiptsSection receipts={receipts} guardianPhone={student.guardianPhone} canCancel={false} />
            ),
          },
          { value: "absences", label: T.absences, count: student.absences.length, content: (
              <AttendanceSheet
                data={await getAttendanceData(student.id)}
                filters={filters}
                basePath={`${ROUTES.assistant.students}/${student.id}`}
                keep={{ onglet: "absences" }}
              />
            ),
          },
          { value: "relances", label: T.followUps, count: student.followUps.length + student.reminders.length, content: <FollowUpsSection student={student} /> },
        ]}
      />
    </div>
  );
}
