import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { centerAddressPattern } from "@/lib/center-url";
import { getCenterTypes, getPlanOptions } from "@/lib/data/platform";
import { toISODate, today } from "@/lib/format";
import { getLabels } from "@/lib/i18n/server";

import { NewCenterForm } from "./new-center-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLabels()).platform.newCenter.title };
}

export default async function NewCenterPage() {
  const L = (await getLabels()).platform.newCenter;
  const [types, plans, addressPattern] = await Promise.all([getCenterTypes(), getPlanOptions(), centerAddressPattern()]);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title={L.title} showTitle />
      <NewCenterForm types={types} plans={plans} todayIso={toISODate(today())} addressPattern={addressPattern} />
    </div>
  );
}
