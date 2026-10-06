import { CalendarClock, FileText, FolderOpen, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/components/shared/app-link";

import { FilterChips } from "@/components/admin/filter-chips";
import { ResourceActions } from "@/components/resources/resource-actions";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/auth/routes";
import { getMyResources, getTeachingOptions } from "@/lib/data/resources";
import { formatDate } from "@/lib/format";
import { getLabels } from "@/lib/i18n/server";
import { formatFileSize } from "@/lib/resources";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLabels()).resources.title };
}

/** Ressources publiées par le professeur : par matière, brouillons et publiées. */
export default async function TeacherResourcesPage({ searchParams }: PageProps<"/professeur/ressources">) {
  const [LABELS, resources, options] = await Promise.all([getLabels(), getMyResources(), getTeachingOptions()]);
  const L = LABELS.resources;
  const { matiere } = await searchParams;
  const filter = typeof matiere === "string" && options.some((option) => option.subjectId === matiere) ? matiere : null;
  const visible = filter ? resources.filter((resource) => resource.subjectId === filter) : resources;
  // Une matière par niveau : le libellé porte le niveau (« Mathématiques · Tronc commun »).
  const subjects = options.map((option) => [option.subjectId, option.label] as const);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={L.title}
        description={L.description}
        actions={
          options.length > 0 ? (
            <Button asChild>
              <Link href={ROUTES.teacher.newResource}>
                <Plus aria-hidden />
                {L.new}
              </Link>
            </Button>
          ) : null
        }
      />

      {options.length === 0 ? (
        <EmptyState icon={FolderOpen} title={L.noAssignmentsTitle} description={L.noAssignmentsDescription} />
      ) : (
        <>
          {subjects.length > 1 ? (
            <FilterChips
              label={L.filterSubject}
              current={filter}
              options={[{ value: null, label: L.allSubjects }, ...subjects.map(([id, name]) => ({ value: id, label: name }))]}
              href={(value) => (value ? `${ROUTES.teacher.resources}?matiere=${value}` : ROUTES.teacher.resources)}
            />
          ) : null}

          {visible.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title={L.emptyTitle}
              description={L.emptyDescription}
              action={
                <Button asChild>
                  <Link href={ROUTES.teacher.newResource}>
                    <Plus aria-hidden />
                    {L.new}
                  </Link>
                </Button>
              }
            />
          ) : (
            <ul className="stagger grid gap-4 lg:grid-cols-2">
              {visible.map((resource) => (
                <li key={resource.id} className="flex flex-col gap-3 rounded-xl bg-card p-5 shadow-card">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{L.types[resource.type]}</Badge>
                    <Badge variant={resource.isPublished ? "default" : "outline"}>{resource.isPublished ? L.published : L.draft}</Badge>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <h2 className="font-semibold text-heading">{resource.title}</h2>
                    <p className="text-caption text-muted-foreground">
                      {resource.subjectName} · {resource.levelName}
                    </p>
                  </div>
                  {resource.description ? <p className="line-clamp-3 text-caption">{resource.description}</p> : null}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
                    {resource.hasFile && resource.fileName ? (
                      <a
                        href={ROUTES.resourceFile(resource.id)}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                      >
                        <FileText className="size-4" aria-hidden />
                        {resource.fileName}
                        {resource.fileSize ? ` (${formatFileSize(resource.fileSize)})` : ""}
                      </a>
                    ) : null}
                    {resource.dueDate ? (
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="size-4" aria-hidden />
                        {L.dueOn(formatDate(resource.dueDate))}
                      </span>
                    ) : null}
                    <span>
                      {resource.isPublished && resource.publishedAt
                        ? L.publishedOn(formatDate(resource.publishedAt))
                        : L.updatedOn(formatDate(resource.updatedAt))}
                    </span>
                  </div>
                  <div className="mt-auto border-t border-divider pt-3">
                    <ResourceActions id={resource.id} isPublished={resource.isPublished} hasFile={resource.hasFile} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
