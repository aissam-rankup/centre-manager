import { ArrowLeft, UserX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { DiscountsPanel } from "@/components/discounts/discounts-panel";
import { EmptyState } from "@/components/shared/empty-state";
import {
  FollowUpsSection,
  PaymentsSection,
  StudentHeader,
} from "@/components/students/student-file-sections";
import { StudentTabs } from "@/components/students/student-tabs";
import { ReceiptsSection } from "@/components/receipts/receipts-section";
import { getStudentReceipts } from "@/lib/data/receipts";
import { getStudentAccess } from "@/lib/data/student-access";
import { StudentAccessCard } from "@/components/students/student-access-card";
import { AttendanceSheet } from "@/components/attendance/attendance-sheet";
import { parseAttendanceFilters } from "@/lib/attendance";
import { getAttendanceData } from "@/lib/data/attendance";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole } from "@/lib/auth/session";
import { getLabels } from "@/lib/i18n/server";
import { getLevelOptions } from "@/lib/data/admin";
import { getLevelsWithSubjects, getStudentFile } from "@/lib/data/assistant";
import { toISODate, today } from "@/lib/format";

import { EnrollmentsEditor, StudentAdminActions } from "./student-admin";

export async function generateMetadata({ params }: PageProps<"/admin/eleves/[id]">): Promise<Metadata> {
  const { id } = await params;
  const student = z.uuid().safeParse(id).success ? await getStudentFile(id) : null;
  return { title: student?.fullName ?? (await getLabels()).assistant.student.notFoundTitle };
}

export default async function AdminStudentPage({ params, searchParams }: PageProps<"/admin/eleves/[id]">) {
  const LABELS = await getLabels();
  const L = LABELS.assistant.student;
  const T = L.tabs;
  const profile = await requireRole("admin");
  // Remises et reçus : module Finance.
  const finance = profile.modules.includes("finance");
  const { id } = await params;
  const query = await searchParams;
  const filters = parseAttendanceFilters(query);
  const tab = typeof query.onglet === "string" ? query.onglet : undefined;
  if (!z.uuid().safeParse(id).success) notFound();

  const [student, levels, catalog] = await Promise.all([getStudentFile(id), getLevelOptions(), getLevelsWithSubjects()]);
  if (!student) {
    return (
      <EmptyState
        icon={UserX}
        title={L.notFoundTitle}
        description={L.notFoundDescription}
        action={
          <Button asChild>
            <Link href={ROUTES.admin.students}>{L.back}</Link>
          </Button>
        }
      />
    );
  }

  const levelCatalog = catalog.find((level) => level.id === student.levelId);
  const [receipts, access] = await Promise.all([getStudentReceipts(student.id), getStudentAccess(student.id)]);

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" className="-ml-3 self-start">
        <Link href={ROUTES.admin.students}>
          <ArrowLeft aria-hidden />
          {L.back}
        </Link>
      </Button>

      <StudentHeader student={student} actions={<StudentAdminActions student={student} levels={levels} />} />

      <EnrollmentsEditor
        studentId={student.id}
        enrollments={student.enrollments}
        packSubscriptions={student.packSubscriptions}
        levelSubjects={levelCatalog?.subjects ?? []}
        levelPacks={levelCatalog?.packs ?? []}
      />

      {finance ? (
        <DiscountsPanel
          studentId={student.id}
          discounts={student.discounts}
          canEdit
          todayIso={toISODate(today())}
          targets={[
            ...(levelCatalog?.subjects ?? []).map((subject) => ({ value: `subject:${subject.id}`, label: subject.name })),
            ...(levelCatalog?.packs ?? []).map((pack) => ({ value: `pack:${pack.id}`, label: LABELS.packs.label(pack.name) })),
          ]}
        />
      ) : null}

      {access ? (
        <StudentAccessCard
          studentId={student.id}
          studentName={student.fullName}
          guardianPhone={student.guardianPhone}
          access={access}
          readOnly={Boolean(profile.support)}
        />
      ) : null}

      <StudentTabs
        defaultValue={tab}
        panels={[
          { value: "paiements", label: T.payments, count: student.invoices.length, content: <PaymentsSection student={student} /> },
          ...(finance
            ? [{ value: "recus", label: T.receipts, count: receipts.length, content: (
                  <ReceiptsSection receipts={receipts} guardianPhone={student.guardianPhone} canCancel={true} />
                ),
              }]
            : []),
          { value: "absences", label: T.absences, count: student.absences.length, content: (
              <AttendanceSheet
                data={await getAttendanceData(student.id)}
                filters={filters}
                basePath={`${ROUTES.admin.students}/${student.id}`}
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
