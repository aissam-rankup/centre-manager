import { UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/auth/routes";
import { LABELS } from "@/lib/constants/labels";
import { searchStudentDirectory } from "@/lib/data/assistant";

import { StudentSearch } from "./student-search";

const L = LABELS.assistant.search;

export const metadata: Metadata = { title: L.title };

export default async function AssistantStudentsPage() {
  // Liste initiale rendue côté serveur : affichage immédiat, sans attendre la première frappe.
  const initialResults = await searchStudentDirectory("");

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
      <StudentSearch initialResults={initialResults} />
    </div>
  );
}
