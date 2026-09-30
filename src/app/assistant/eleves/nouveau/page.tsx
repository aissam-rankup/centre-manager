import { Layers } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { getLabels } from "@/lib/i18n/server";
import { getLevelsWithSubjects } from "@/lib/data/assistant";
import { toISODate, today } from "@/lib/format";

import { NewStudentForm } from "./new-student-form";


export async function generateMetadata(): Promise<Metadata> {
  const LABELS = await getLabels();
  const L = LABELS.assistant.newStudent;
  return { title: L.title };
}

export default async function NewStudentPage() {
  const LABELS = await getLabels();
  const L = LABELS.assistant.newStudent;
  const levels = await getLevelsWithSubjects();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader title={L.title} description={L.description} />
      {levels.length === 0 ? (
        <EmptyState icon={Layers} title={L.noLevelsTitle} description={L.noLevelsDescription} />
      ) : (
        <NewStudentForm levels={levels} todayIso={toISODate(today())} />
      )}
    </div>
  );
}
