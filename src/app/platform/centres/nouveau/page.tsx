import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { LABELS } from "@/lib/constants/labels";
import { getCenterTypes } from "@/lib/data/platform";
import { toISODate, today } from "@/lib/format";

import { NewCenterForm } from "./new-center-form";

const L = LABELS.platform.newCenter;

export const metadata: Metadata = { title: L.title };

export default async function NewCenterPage() {
  const types = await getCenterTypes();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title={L.title} showTitle />
      <NewCenterForm types={types} todayIso={toISODate(today())} />
    </div>
  );
}
