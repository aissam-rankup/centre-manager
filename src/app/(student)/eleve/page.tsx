import { BookOpen } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { requireStudent } from "@/lib/auth/session";
import { getLabels } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLabels()).studentSpace.title };
}

/** Accueil de l'élève (les ressources publiées arrivent avec la phase 5). */
export default async function StudentHomePage() {
  const [student, LABELS] = await Promise.all([requireStudent(), getLabels()]);
  const L = LABELS.studentSpace;
  return (
    <>
      <PageHeader showTitle title={L.welcome(student.fullName)} description={L.description(student.centerName, student.levelName)} />
      <EmptyState icon={BookOpen} title={L.comingSoonTitle} description={L.comingSoon} />
    </>
  );
}
