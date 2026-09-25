import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/auth/routes";
import { LABELS } from "@/lib/constants/labels";
import {
  AbsencesSection,
  FollowUpsSection,
  PaymentsSection,
  StudentHeader,
  SubjectsSection,
} from "@/components/students/student-file-sections";
import { getStudentFile, type StudentFile } from "@/lib/data/assistant";

const L = LABELS.assistant.student;

async function loadStudent(id: string): Promise<StudentFile> {
  if (!z.uuid().safeParse(id).success) notFound();
  const student = await getStudentFile(id);
  if (!student) notFound();
  return student;
}

export async function generateMetadata({ params }: PageProps<"/assistant/eleves/[id]">): Promise<Metadata> {
  const { id } = await params;
  const student = z.uuid().safeParse(id).success ? await getStudentFile(id) : null;
  return { title: student?.fullName ?? L.notFoundTitle };
}

export default async function StudentFilePage({ params }: PageProps<"/assistant/eleves/[id]">) {
  const { id } = await params;
  const student = await loadStudent(id);

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" className="-ml-3 self-start">
        <Link href={ROUTES.assistant.students}>
          <ArrowLeft aria-hidden />
          {L.back}
        </Link>
      </Button>

      <StudentHeader student={student} />

      <div className="grid gap-6 lg:grid-cols-2">
        <SubjectsSection student={student} />
        <FollowUpsSection student={student} />
      </div>

      <PaymentsSection student={student} />
      <AbsencesSection student={student} />
    </div>
  );
}
