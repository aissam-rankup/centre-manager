import { ArrowLeft, UserX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { EmptyState } from "@/components/shared/empty-state";
import {
  AbsencesSection,
  FollowUpsSection,
  PaymentsSection,
  StudentHeader,
} from "@/components/students/student-file-sections";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole } from "@/lib/auth/session";
import { LABELS } from "@/lib/constants/labels";
import { getLevelOptions } from "@/lib/data/admin";
import { getLevelsWithSubjects, getStudentFile } from "@/lib/data/assistant";

import { EnrollmentsEditor, StudentAdminActions } from "./student-admin";

const L = LABELS.assistant.student;

export async function generateMetadata({ params }: PageProps<"/admin/eleves/[id]">): Promise<Metadata> {
  const { id } = await params;
  const student = z.uuid().safeParse(id).success ? await getStudentFile(id) : null;
  return { title: student?.fullName ?? L.notFoundTitle };
}

export default async function AdminStudentPage({ params }: PageProps<"/admin/eleves/[id]">) {
  await requireRole("admin");
  const { id } = await params;
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

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" className="-ml-3 self-start">
        <Link href={ROUTES.admin.students}>
          <ArrowLeft aria-hidden />
          {L.back}
        </Link>
      </Button>

      <StudentHeader student={student} actions={<StudentAdminActions student={student} levels={levels} />} />

      <div className="grid gap-6 lg:grid-cols-2">
        <EnrollmentsEditor
          studentId={student.id}
          enrollments={student.enrollments}
          packSubscriptions={student.packSubscriptions}
          levelSubjects={levelCatalog?.subjects ?? []}
          levelPacks={levelCatalog?.packs ?? []}
        />
        <FollowUpsSection student={student} />
      </div>

      <PaymentsSection student={student} />
      <AbsencesSection student={student} />
    </div>
  );
}
