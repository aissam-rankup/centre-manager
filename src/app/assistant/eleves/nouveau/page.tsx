import { Layers } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { LABELS } from "@/lib/constants/labels";
import { getLevelsWithSubjects } from "@/lib/data/assistant";
import { toISODate, today } from "@/lib/format";

import { NewStudentForm } from "./new-student-form";

const L = LABELS.assistant.newStudent;

export const metadata: Metadata = { title: L.title };

export default async function NewStudentPage() {
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
