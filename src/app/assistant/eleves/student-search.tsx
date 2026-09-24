"use client";

import { ChevronRight, LoaderCircle, Search, SearchX, Users, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { searchStudents } from "@/lib/actions/assistant";
import { ROUTES } from "@/lib/auth/routes";
import { LABELS } from "@/lib/constants/labels";
import type { StudentListItem } from "@/lib/data/assistant";

const L = LABELS.assistant.search;
const DEBOUNCE_MS = 200;

export function StudentSearch({ initialResults }: { initialResults: StudentListItem[] }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(initialResults);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, startTransition] = useTransition();
  // Seule la réponse à la dernière frappe est affichée (les réponses tardives sont ignorées).
  const requestId = useRef(0);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const id = ++requestId.current;
    const timer = window.setTimeout(() => {
      startTransition(async () => {
        const result = await searchStudents(query);
        if (id !== requestId.current) return;
        if (result.ok) {
          setResults(result.data);
          setError(null);
        } else {
          setError(result.error);
        }
      });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, attempt]);

  const hasQuery = query.trim().length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div role="search" className="relative">
        <label htmlFor="recherche-eleve" className="sr-only">
          {L.label}
        </label>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          id="recherche-eleve"
          type="search"
          inputMode="search"
          autoComplete="off"
          autoFocus
          enterKeyHint="search"
          placeholder={L.placeholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-12 pr-12 pl-10 text-base [&::-webkit-search-cancel-button]:hidden"
        />
        {hasQuery ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-1/2 right-0.5 -translate-y-1/2"
            onClick={() => setQuery("")}
            aria-label={L.clear}
          >
            <X aria-hidden />
          </Button>
        ) : null}
      </div>

      <p className="flex h-5 items-center gap-2 text-caption text-muted-foreground" aria-live="polite">
        {pending ? (
          <>
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            {L.searching}
          </>
        ) : (
          L.results(results.length)
        )}
      </p>

      {error ? (
        <ErrorState description={error} onRetry={() => setAttempt((value) => value + 1)} />
      ) : pending && results.length === 0 ? (
        <ResultsSkeleton />
      ) : results.length === 0 ? (
        hasQuery ? (
          <EmptyState icon={SearchX} title={L.emptyTitle} description={L.emptyDescription} />
        ) : (
          <EmptyState icon={Users} title={L.noStudentsTitle} description={L.noStudentsDescription} />
        )
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-soft" aria-busy={pending}>
          {results.map((student) => (
            <li key={student.id} className="border-b last:border-b-0">
              <Link
                href={`${ROUTES.assistant.students}/${student.id}`}
                className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60"
              >
                <StudentAvatar
                  name={student.fullName}
                  photoUrl={student.photoUrl}
                  status={student.isOverdue ? "overdue" : "upToDate"}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{student.fullName}</span>
                  <span className="truncate text-caption text-muted-foreground">{student.levelName}</span>
                </span>
                <StatusBadge status={student.isOverdue ? "overdue" : "upToDate"} />
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4" aria-hidden>
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}
