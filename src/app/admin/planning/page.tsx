import { BookOpen } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { LABELS } from "@/lib/constants/labels";
import { getPlanningData } from "@/lib/data/admin";

import { PlanningBoard } from "./planning-board";

const L = LABELS.admin.planning;

export const metadata: Metadata = { title: L.title };

export default async function AdminPlanningPage() {
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
