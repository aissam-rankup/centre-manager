import { Layers } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { getLabels } from "@/lib/i18n/server";
import { getLevelsWithSubjects } from "@/lib/data/assistant";

import { NewTeacherForm } from "./new-teacher-form";


export async function generateMetadata(): Promise<Metadata> {
  const LABELS = await getLabels();
  const L = LABELS.assistant.newTeacher;
  return { title: L.title };
}

export default async function NewTeacherPage() {
  const LABELS = await getLabels();
  const L = LABELS.assistant.newTeacher;
  const levels = (await getLevelsWithSubjects()).filter((level) => level.subjects.length > 0);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader title={L.title} description={L.description} />
      {levels.length === 0 ? (
        <EmptyState icon={Layers} title={L.noSubjectsTitle} description={L.noSubjectsDescription} />
      ) : (
        <NewTeacherForm levels={levels} />
      )}
    </div>
  );
}
