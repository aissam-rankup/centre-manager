"use client";

import { Search, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";

import { StudentIntentCard } from "@/components/reenrollment/student-intent-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { useLabels } from "@/lib/i18n/client";
import { isLeaving, type ReviewStudent } from "@/lib/reenrollment";
import { cn } from "@/lib/utils";

type Filter = "all" | "risk" | "pending" | "confirmed" | "leaving";

const MATCHES: Record<Filter, (student: ReviewStudent) => boolean> = {
  all: () => true,
  risk: (student) => student.atRisk,
  pending: (student) => student.intent === "pending",
  confirmed: (student) => student.intent === "confirmed",
  leaving: (student) => isLeaving(student.intent),
};

function normalize(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

type CampaignStudentsProps = {
  runId: string;
  students: readonly ReviewStudent[];
  editable: boolean;
  issued: boolean;
  fileBase: string;
};

/** Liste des élèves de la campagne : filtres (à risque, sans décision…), recherche, cartes d'intention. */
export function CampaignStudents({ runId, students, editable, issued, fileBase }: CampaignStudentsProps) {
  const LABELS = useLabels();
  const R = LABELS.reenrollment.review;
  const [filter, setFilter] = useState<Filter>(editable && students.some((student) => student.atRisk) ? "risk" : "all");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const needle = normalize(query);
    return students.filter((student) => MATCHES[filter](student) && (!needle || normalize(student.fullName).includes(needle)));
  }, [students, filter, query]);

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: R.filters.all(students.length) },
    { value: "risk", label: R.filters.risk(students.filter(MATCHES.risk).length) },
    { value: "pending", label: R.filters.pending(students.filter(MATCHES.pending).length) },
    { value: "confirmed", label: R.filters.confirmed(students.filter(MATCHES.confirmed).length) },
    { value: "leaving", label: R.filters.leaving(students.filter(MATCHES.leaving).length) },
  ];

  return (
    <section className="flex flex-col gap-4" aria-label={R.filters.label}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="group" aria-label={R.filters.label} className="-mx-4 overflow-x-auto px-4 no-scrollbar md:mx-0 md:px-0">
          <ul className="flex w-max gap-2">
            {filters.map((option) => {
              const active = option.value === filter;
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(option.value)}
                    className={cn(
                      "inline-flex h-11 items-center rounded-full border px-4 font-medium whitespace-nowrap transition-colors",
                      active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                    )}
                  >
                    {option.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <label className="relative w-full lg:w-72">
          <span className="sr-only">{R.search}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={R.search}
            className="h-11 pl-9 font-normal"
          />
        </label>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={UsersRound} title={R.noMatch} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {visible.map((student) => (
            <StudentIntentCard
              key={student.studentId}
              runId={runId}
              student={student}
              editable={editable}
              issued={issued}
              fileHref={`${fileBase}/${student.studentId}`}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
