import { BookOpen, CalendarClock, FileText, Image as ImageIcon, Sparkles } from "lucide-react";
import type { Metadata } from "next";

import { FilterChips } from "@/components/admin/filter-chips";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { ResourceLinks } from "@/components/student-space/resource-links";
import { Badge } from "@/components/ui/badge";
import { ROUTES } from "@/lib/auth/routes";
import { requireStudent } from "@/lib/auth/session";
import { getStudentSpace, type StudentResource } from "@/lib/data/student-space";
import { formatDate } from "@/lib/format";
import { getLabels } from "@/lib/i18n/server";
import { formatFileSize, RESOURCE_TYPES } from "@/lib/resources";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLabels()).studentSpace.title };
}

/**
 * Espace élève : nouveautés et échéances, puis les ressources publiées de ses
 * matières, classées par matière et par type.
 */
export default async function StudentHomePage({ searchParams }: PageProps<"/eleve">) {
  const [student, LABELS, space] = await Promise.all([requireStudent(), getLabels(), getStudentSpace()]);
  const L = LABELS.studentSpace;
  const T = LABELS.resources.types;
  const { matiere } = await searchParams;
  const filter = typeof matiere === "string" && space.subjects.some((subject) => subject.id === matiere) ? matiere : null;
  const subjects = filter ? space.subjects.filter((subject) => subject.id === filter) : space.subjects;

  const card = (resource: StudentResource, compact = false) => (
    <li key={resource.id} className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-card md:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{T[resource.type]}</Badge>
        {resource.isNew ? (
          <Badge>
            <Sparkles aria-hidden />
            {L.new}
          </Badge>
        ) : null}
        {resource.dueInDays !== null ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-caption font-medium",
              resource.dueInDays < 0 ? "text-muted-foreground" : resource.dueInDays <= 2 ? "text-danger-ink" : "text-warning-ink",
            )}
          >
            <CalendarClock className="size-4" aria-hidden />
            {L.dueIn(resource.dueInDays)}
            {resource.dueDate && resource.dueInDays > 1 ? ` ${L.dueOn(formatDate(resource.dueDate))}` : ""}
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-0.5">
        <h3 className="font-semibold text-heading">{resource.title}</h3>
        <p className="text-caption text-muted-foreground">
          {compact ? `${resource.subjectName} · ` : ""}
          {resource.authorName ? `${L.by(resource.authorName)} · ` : ""}
          {resource.publishedAt ? L.publishedOn(formatDate(resource.publishedAt)) : ""}
        </p>
      </div>
      {resource.description && !compact ? <p className="text-caption whitespace-pre-line">{resource.description}</p> : null}
      {resource.fileName ? (
        <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
          {resource.fileType === "application/pdf" ? <FileText className="size-4" aria-hidden /> : <ImageIcon className="size-4" aria-hidden />}
          <span className="truncate">{resource.fileName}</span>
          {resource.fileSize ? <span className="shrink-0">({formatFileSize(resource.fileSize)})</span> : null}
        </p>
      ) : null}
      <div className="mt-auto">
        <ResourceLinks id={resource.id} title={resource.title} />
      </div>
    </li>
  );

  return (
    <>
      <PageHeader showTitle title={L.welcome(student.fullName)} description={L.description(student.centerName, student.levelName)} />

      {space.resources.length === 0 ? (
        <EmptyState icon={BookOpen} title={L.comingSoonTitle} description={L.comingSoon} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {space.newCount > 0 ? (
              <Badge>
                <Sparkles aria-hidden />
                {L.newCount(space.newCount)}
              </Badge>
            ) : null}
            {space.upcoming.length > 0 ? <Badge variant="outline">{L.dueCount(space.upcoming.length)}</Badge> : null}
          </div>

          {space.upcoming.length > 0 ? (
            <section aria-labelledby="echeances" className="flex flex-col gap-3">
              <h2 id="echeances" className="text-section text-heading">
                {L.dueSoonTitle}
              </h2>
              <ul className="grid gap-3 md:grid-cols-2">{space.upcoming.slice(0, 4).map((resource) => card(resource, true))}</ul>
            </section>
          ) : null}

          <section aria-labelledby="ressources" className="flex flex-col gap-4">
            <h2 id="ressources" className="text-section text-heading">
              {L.resourcesTitle}
            </h2>
            {space.subjects.length > 1 ? (
              <FilterChips
                label={L.filterSubject}
                current={filter}
                options={[{ value: null, label: L.allSubjects }, ...space.subjects.map((subject) => ({ value: subject.id, label: subject.name }))]}
                href={(value) => (value ? `${ROUTES.student.home}?matiere=${value}` : ROUTES.student.home)}
              />
            ) : null}

            {subjects.map((subject) => {
              const ofSubject = space.resources.filter((resource) => resource.subjectId === subject.id);
              return (
                <section key={subject.id} aria-labelledby={`matiere-${subject.id}`} className="flex flex-col gap-3">
                  <h3 id={`matiere-${subject.id}`} className="border-b border-divider pb-1 font-semibold text-heading">
                    {subject.name}
                  </h3>
                  {RESOURCE_TYPES.map((type) => {
                    const ofType = ofSubject.filter((resource) => resource.type === type);
                    if (ofType.length === 0) return null;
                    return (
                      <div key={type} className="flex flex-col gap-2">
                        <p className="text-caption font-medium text-muted-foreground">{L.typeGroups[type]}</p>
                        <ul className="grid gap-3 md:grid-cols-2">{ofType.map((resource) => card(resource))}</ul>
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </section>
        </>
      )}
    </>
  );
}
