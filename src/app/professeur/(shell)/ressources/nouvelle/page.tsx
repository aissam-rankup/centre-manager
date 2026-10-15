import { ArrowLeft, FolderOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/components/shared/app-link";

import { ResourceForm } from "@/components/resources/resource-form";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/auth/routes";
import { getTeachingOptions } from "@/lib/data/resources";
import { getLabels } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLabels()).resources.newTitle };
}

/** Publier une ressource pour une de ses matières. */
export default async function NewResourcePage() {
  const [LABELS, options] = await Promise.all([getLabels(), getTeachingOptions()]);
  const L = LABELS.resources;
  const only = options.length === 1 ? options[0] : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Button asChild variant="ghost" className="-ms-3 self-start">
        <Link href={ROUTES.teacher.resources}>
          <ArrowLeft aria-hidden />
          {L.back}
        </Link>
      </Button>
      <PageHeader showTitle title={L.newTitle} description={L.description} />
      {options.length === 0 ? (
        <EmptyState icon={FolderOpen} title={L.noAssignmentsTitle} description={L.noAssignmentsDescription} />
      ) : (
        <ResourceForm
          options={options}
          defaults={{
            type: "exercise",
            subject: only ? `${only.subjectId}:${only.levelId}` : "",
            title: "",
            description: "",
            dueDate: "",
            publish: true,
            currentFileName: null,
          }}
        />
      )}
    </div>
  );
}
