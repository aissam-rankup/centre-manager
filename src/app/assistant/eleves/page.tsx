import { UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/auth/routes";
import { getLabels } from "@/lib/i18n/server";
import { searchStudentDirectory } from "@/lib/data/assistant";

import { StudentSearch } from "./student-search";


export async function generateMetadata(): Promise<Metadata> {
  const LABELS = await getLabels();
  const L = LABELS.assistant.search;
  return { title: L.title };
}

export default async function AssistantStudentsPage({ searchParams }: PageProps<"/assistant/eleves">) {
  const LABELS = await getLabels();
  const L = LABELS.assistant.search;
  // « q » : recherche lancée depuis l'en-tête de l'application.
  const { q } = await searchParams;
  const initialQuery = typeof q === "string" ? q : "";
  // Liste initiale rendue côté serveur : affichage immédiat, sans attendre la première frappe.
  const initialResults = await searchStudentDirectory(initialQuery);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={L.title}
        description={L.description}
        actions={
          <Button asChild>
            <Link href={ROUTES.assistant.newStudent}>
              <UserPlus aria-hidden />
              {L.newStudent}
            </Link>
          </Button>
        }
      />
      <StudentSearch key={initialQuery} initialResults={initialResults} initialQuery={initialQuery} />
    </div>
  );
}
