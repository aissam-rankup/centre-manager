import { BookOpen } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { getLabels } from "@/lib/i18n/server";
import { getPlanningData } from "@/lib/data/admin";

import { PlanningBoard } from "./planning-board";


export async function generateMetadata(): Promise<Metadata> {
  const LABELS = await getLabels();
  const L = LABELS.admin.planning;
  return { title: L.title };
}

export default async function AdminPlanningPage() {
  const LABELS = await getLabels();
  const L = LABELS.admin.planning;
  const data = await getPlanningData();

  return (
    <div className="flex flex-col gap-6">
      {data.subjects.length === 0 ? (
        <>
          <PageHeader title={L.title} description={L.description} />
          <EmptyState icon={BookOpen} title={L.noSubjectsTitle} description={L.noSubjectsDescription} />
        </>
      ) : (
        <PlanningBoard data={data} />
      )}
    </div>
  );
}
