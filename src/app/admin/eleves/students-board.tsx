"use client";

import { Search, SearchX } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";

import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ROUTES } from "@/lib/auth/routes";
import { LABELS } from "@/lib/constants/labels";
import type { AdminStudentRow, LevelOption } from "@/lib/data/admin";
import { formatPhone } from "@/lib/phone";

const L = LABELS.admin.students;

/** Minuscules, sans accents : même logique que la recherche en base. */
function normalize(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

const COLUMNS: readonly DataTableColumn<AdminStudentRow>[] = [
  {
    id: "name",
    header: L.name,
    mobile: "title",
    cell: (student) => (
      <Link href={`${ROUTES.admin.students}/${student.id}`} className="flex items-center gap-3 rounded-[10px]">
        <StudentAvatar name={student.fullName} photoUrl={student.photoUrl} status={student.isOverdue ? "overdue" : "upToDate"} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium underline-offset-4 hover:underline">{student.fullName}</span>
          <span className="truncate text-caption text-muted-foreground md:hidden">{student.levelName}</span>
        </span>
      </Link>
    ),
  },
  { id: "level", header: L.level, mobile: "hidden", cell: (student) => student.levelName },
  {
    id: "guardian",
    header: L.guardian,
    cell: (student) =>
      student.guardianPhone ? (
        <span className="numeric font-normal">{formatPhone(student.guardianPhone)}</span>
      ) : (
        LABELS.common.none
      ),
  },
  { id: "unpaid", header: L.unpaid, align: "end", cell: (student) => <Money amount={student.unpaidAmount} /> },
  {
    id: "status",
    header: L.status,
    mobile: "aside",
    cell: (student) => <StatusBadge status={student.isOverdue ? "overdue" : "upToDate"} />,
  },
];

export function StudentsBoard({ students, levels }: { students: AdminStudentRow[]; levels: LevelOption[] }) {
  const [query, setQuery] = useState("");
  const [levelId, setLevelId] = useState("");
  const [status, setStatus] = useState<"" | "overdue" | "upToDate">("");
  const deferredQuery = useDeferredValue(query);

  const rows = useMemo(() => {
    const needle = normalize(deferredQuery);
    return students.filter(
      (student) =>
        (!needle || normalize(student.fullName).includes(needle)) &&
        (!levelId || student.levelId === levelId) &&
        (!status || (status === "overdue") === student.isOverdue),
    );
  }, [students, deferredQuery, levelId, status]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={L.title} description={L.description} />

      <div className="grid gap-3 md:grid-cols-[1fr_220px_180px]">
        <div role="search" className="relative">
          <label htmlFor="admin-recherche" className="sr-only">
            {L.search}
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id="admin-recherche"
            type="search"
            placeholder={L.searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-10"
            autoComplete="off"
          />
        </div>
        <label className="sr-only" htmlFor="admin-niveau">
          {L.filterLevel}
        </label>
        <NativeSelect id="admin-niveau" value={levelId} onChange={(event) => setLevelId(event.target.value)}>
          <option value="">{L.allLevels}</option>
          {levels.map((level) => (
            <option key={level.id} value={level.id}>
              {level.name}
            </option>
          ))}
        </NativeSelect>
        <label className="sr-only" htmlFor="admin-statut">
          {L.filterStatus}
        </label>
        <NativeSelect
          id="admin-statut"
          value={status}
          onChange={(event) => setStatus(event.target.value as "" | "overdue" | "upToDate")}
        >
          <option value="">{L.allStatuses}</option>
          <option value="upToDate">{LABELS.status.upToDate}</option>
          <option value="overdue">{LABELS.status.overdue}</option>
        </NativeSelect>
      </div>

      <p className="text-caption text-muted-foreground" aria-live="polite">
        {L.results(rows.length)}
      </p>

      {rows.length === 0 ? (
        <EmptyState icon={SearchX} title={L.emptyTitle} description={L.emptyDescription} />
      ) : (
        <DataTable columns={COLUMNS} rows={rows} getRowId={(student) => student.id} caption={L.caption} />
      )}
    </div>
  );
}
