import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import type { Metadata } from "next";

import { DeleteLevelButton, DeleteSubjectButton } from "@/components/admin/delete-buttons";
import { LevelDialog, SubjectDialog } from "@/components/admin/level-subject-dialogs";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import { LABELS } from "@/lib/constants/labels";
import { getLevelsWithStats } from "@/lib/data/admin";

const L = LABELS.admin.subjects;
const C = LABELS.admin.common;

export const metadata: Metadata = { title: L.title };

export default async function AdminSubjectsPage() {
  const levels = await getLevelsWithStats();
  const nextSortOrder = Math.max(0, ...levels.map((level) => level.sortOrder)) + 1;

  const newLevelButton = (
    <Button>
      <Plus aria-hidden />
      {L.newLevel}
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={L.title}
        description={L.description}
        actions={<LevelDialog trigger={newLevelButton} nextSortOrder={nextSortOrder} />}
      />

      {levels.length === 0 ? (
        <EmptyState icon={Layers} title={L.emptyTitle} description={L.emptyDescription} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {levels.map((level) => (
            <SectionCard
              key={level.id}
              title={level.name}
              description={L.studentsInLevel(level.studentCount)}
              aside={
                <div className="flex gap-1">
                  <LevelDialog
                    level={level}
                    nextSortOrder={nextSortOrder}
                    trigger={
                      <Button variant="ghost" size="icon" aria-label={`${L.editLevel} — ${level.name}`}>
                        <Pencil aria-hidden />
                      </Button>
                    }
                  />
                  <DeleteLevelButton levelId={level.id} name={level.name}>
                    <Button variant="ghost" size="icon" aria-label={`${C.delete} — ${level.name}`}>
                      <Trash2 aria-hidden />
                    </Button>
                  </DeleteLevelButton>
                </div>
              }
            >
              {level.subjects.length === 0 ? (
                <p className="rounded-[10px] border border-dashed px-4 py-3 text-muted-foreground">{L.noSubjects}</p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {level.subjects.map((subject) => (
                    <li key={subject.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">{subject.name}</span>
                        <span className="text-caption text-muted-foreground">{L.enrolled(subject.activeEnrollments)}</span>
                      </div>
                      <span className="shrink-0 text-right">
                        <Money amount={subject.monthlyPrice} />
                        <span className="block text-caption text-muted-foreground">{LABELS.billing.perMonth}</span>
                      </span>
                      <div className="flex shrink-0">
                        <SubjectDialog
                          levelId={level.id}
                          levelName={level.name}
                          subject={subject}
                          trigger={
                            <Button variant="ghost" size="icon" aria-label={`${L.editSubject} — ${subject.name}`}>
                              <Pencil aria-hidden />
                            </Button>
                          }
                        />
                        <DeleteSubjectButton subjectId={subject.id} name={subject.name}>
                          <Button variant="ghost" size="icon" aria-label={`${C.delete} — ${subject.name}`}>
                            <Trash2 aria-hidden />
                          </Button>
                        </DeleteSubjectButton>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <SubjectDialog
                levelId={level.id}
                levelName={level.name}
                trigger={
                  <Button variant="outline" className="self-start">
                    <Plus aria-hidden />
                    {L.newSubject}
                  </Button>
                }
              />
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}
