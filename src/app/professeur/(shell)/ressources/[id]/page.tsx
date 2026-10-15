import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/components/shared/app-link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ResourceForm } from "@/components/resources/resource-form";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/auth/routes";
import { getMyResource, getTeachingOptions } from "@/lib/data/resources";
import { getLabels } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLabels()).resources.editTitle };
}

/** Modifier une de ses ressources (fichier remplaçable). */
export default async function EditResourcePage({ params }: PageProps<"/professeur/ressources/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [LABELS, resource, options] = await Promise.all([getLabels(), getMyResource(id), getTeachingOptions()]);
  if (!resource) notFound();
  const L = LABELS.resources;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Button asChild variant="ghost" className="-ms-3 self-start">
        <Link href={ROUTES.teacher.resources}>
          <ArrowLeft aria-hidden />
          {L.back}
        </Link>
      </Button>
      <PageHeader showTitle title={L.editTitle} description={resource.title} />
      <ResourceForm
        options={options}
        defaults={{
          id: resource.id,
          type: resource.type,
          subject: `${resource.subjectId}:${resource.levelId}`,
          title: resource.title,
          description: resource.description ?? "",
          dueDate: resource.dueDate ?? "",
          publish: resource.isPublished,
          currentFileName: resource.fileName,
        }}
      />
    </div>
  );
}
