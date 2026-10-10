"use client";

import { ChevronDown, MessageCircle, MoreVertical, Phone, Search, UserRound, Users } from "lucide-react";
import Link from "@/components/shared/app-link";
import { useMemo, useState } from "react";

import { SectionHeading } from "@/components/dashboard/section-heading";
import { EmptyState } from "@/components/shared/empty-state";
import { DiscountBadges } from "@/components/discounts/discount-badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { AppLabels } from "@/lib/constants/labels";
import { useLabels } from "@/lib/i18n/client";
import type { DashboardStudent, DashboardStudentStatus } from "@/lib/data/admin";
import { formatPhoneIntl, toTelHref, toWhatsAppHref } from "@/lib/phone";
import { cn } from "@/lib/utils";

type SortKey = "fullName" | "levelName" | "subjects" | "status";
const STATUS_RANK: Record<DashboardStudentStatus, number> = { overdue: 0, followedUp: 1, upToDate: 2 };
/** « wide » : colonne affichée à partir de 1280 px (tablette : tableau lisible sans défilement). */
function columns(LABELS: AppLabels): { key: SortKey; label: string; wide?: boolean }[] {
  const L = LABELS.dashboard.students;
  return [
    { key: "fullName", label: L.name },
    { key: "levelName", label: L.level },
    { key: "subjects", label: L.subjects, wide: true },
    { key: "status", label: L.status },
  ];
}

type StudentBoardProps = {
  students: DashboardStudent[];
  /** Préfixe de la fiche élève (ex. « /admin/eleves »). */
  fileBase: string;
  /** Lien « Voir tout ». */
  seeAllHref: string;
};

/**
 * Liste des élèves du tableau de bord : tri au clic sur les en-têtes,
 * recherche dans la liste, menu d'actions réelles par ligne ; cartes sous 768 px.
 */
export function StudentBoard({ students, fileBase, seeAllHref }: StudentBoardProps) {
  const LABELS = useLabels();
  const L = LABELS.dashboard.students;
  const [sort, setSort] = useState<{ key: SortKey; direction: 1 | -1 }>({ key: "status", direction: 1 });
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    const filtered = needle
      ? students.filter((student) => student.fullName.toLocaleLowerCase("fr").includes(needle))
      : students;
    return [...filtered].sort((a, b) => {
      const order =
        sort.key === "status"
          ? STATUS_RANK[a.status] - STATUS_RANK[b.status]
          : a[sort.key].localeCompare(b[sort.key], "fr");
      return order * sort.direction || a.fullName.localeCompare(b.fullName, "fr");
    });
  }, [students, sort, query]);

  const toggleSort = (key: SortKey) =>
    setSort((current) => ({ key, direction: current.key === key ? (current.direction === 1 ? -1 : 1) : 1 }));

  return (
    <section aria-labelledby="liste-eleves" className="flex min-w-0 flex-col gap-3">
      <SectionHeading
        id="liste-eleves"
        title={L.title}
        href={seeAllHref}
        actions={
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-subtle"
            aria-label={L.search}
            aria-expanded={searchOpen}
            onClick={() => {
              setSearchOpen((open) => !open);
              setQuery("");
            }}
          >
            <Search className="size-4" aria-hidden />
          </Button>
        }
      />

      {searchOpen ? (
        <label className="relative flex h-9 items-center">
          <span className="sr-only">{L.search}</span>
          <Search className="pointer-events-none absolute start-3.5 size-3.5 text-subtle" aria-hidden />
          <input
            // Ouverte à la demande : le champ prend le focus.
            autoFocus
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={L.searchPlaceholder}
            className="h-full w-full rounded-full border border-border bg-card pe-4 ps-9 text-table outline-none placeholder:text-subtle focus-visible:border-primary"
          />
        </label>
      ) : null}

      {students.length === 0 ? (
        <EmptyState icon={Users} title={L.emptyTitle} description={L.emptyDescription} />
      ) : rows.length === 0 ? (
        <p className="rounded-xl bg-card px-6 py-5 text-muted-foreground shadow-card">{L.noMatch}</p>
      ) : (
        <>
          {/* Mobile : cartes */}
          <ul className="flex flex-col gap-3 md:hidden" aria-label={L.caption}>
            {rows.map((student) => (
              <li key={student.id} className="flex items-center gap-3 rounded-xl bg-card p-4 shadow-card">
                <StudentAvatar name={student.fullName} photoUrl={student.photoUrl} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <Link href={`${fileBase}/${student.id}`} className="truncate rounded-sm font-medium text-heading">
                    {student.fullName}
                  </Link>
                  <span className="truncate text-caption text-muted-foreground">{student.levelName}</span>
                  <StatusBadge status={student.status} />
                  <DiscountBadges discounts={student.discounts} />
                  <PhoneLink phone={student.guardianPhone} />
                </div>
                <RowMenu student={student} fileBase={fileBase} />
              </li>
            ))}
          </ul>

          {/* Desktop : tableau défilant, en-tête collant */}
          <div className="hidden max-h-[520px] overflow-auto rounded-xl bg-card shadow-card md:block">
            <table className="w-full border-collapse text-start text-table">
              <caption className="sr-only">{L.caption}</caption>
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="h-12 border-b border-divider">
                  {columns(LABELS).map((column) => {
                    const active = sort.key === column.key;
                    return (
                      <th
                        key={column.key}
                        scope="col"
                        aria-sort={active ? (sort.direction === 1 ? "ascending" : "descending") : "none"}
                        className={cn("px-3 font-medium whitespace-nowrap text-heading first:ps-4 lg:px-4 lg:first:ps-6", column.wide && "hidden xl:table-cell")}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(column.key)}
                          aria-label={L.sortBy(column.label)}
                          className="inline-flex items-center gap-1 rounded-sm"
                        >
                          {column.label}
                          <ChevronDown
                            className={cn(
                              "size-3 text-subtle transition-transform duration-200",
                              active && sort.direction === -1 && "rotate-180",
                              active && "text-primary",
                            )}
                            aria-hidden
                          />
                        </button>
                      </th>
                    );
                  })}
                  <th scope="col" className="px-3 font-medium whitespace-nowrap text-heading lg:px-4">
                    {L.phone}
                  </th>
                  <th scope="col" className="w-10 pe-2 lg:pe-4">
                    <span className="sr-only">{L.actions}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((student) => (
                  <tr key={student.id} className="h-[52px] border-b border-divider transition-colors duration-150 last:border-b-0 hover:bg-row-hover">
                    <td className="px-3 ps-4 lg:px-4 lg:ps-6">
                      <Link href={`${fileBase}/${student.id}`} className="flex items-center gap-3 rounded-sm font-medium text-heading">
                        <StudentAvatar name={student.fullName} photoUrl={student.photoUrl} className="size-7 border" />
                        <span className="truncate">{student.fullName}</span>
                      </Link>
                    </td>
                    <td className="max-w-[150px] truncate px-3 lg:px-4 xl:max-w-none" title={student.levelName}>
                      {student.levelName}
                    </td>
                    <td className="hidden max-w-[200px] truncate px-4 xl:table-cell">{student.subjects}</td>
                    <td className="px-3 lg:px-4">
                      <span className="flex flex-col gap-1 py-1.5">
                        <StatusBadge status={student.status} />
                        <DiscountBadges discounts={student.discounts} />
                      </span>
                    </td>
                    <td className="px-3 whitespace-nowrap lg:px-4">
                      <PhoneLink phone={student.guardianPhone} />
                    </td>
                    <td className="pe-2 text-end lg:pe-4">
                      <RowMenu student={student} fileBase={fileBase} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function PhoneLink({ phone }: { phone: string | null }) {
  const LABELS = useLabels();
  const href = phone ? toTelHref(phone) : null;
  if (!phone) return <span className="text-subtle">{LABELS.common.none}</span>;
  return href ? (
    <a href={href} className="numeric w-fit rounded-sm font-normal hover:text-primary">
      {formatPhoneIntl(phone)}
    </a>
  ) : (
    <span className="numeric font-normal">{phone}</span>
  );
}

function RowMenu({ student, fileBase }: { student: DashboardStudent; fileBase: string }) {
  const LABELS = useLabels();
  const L = LABELS.dashboard.students;
  const tel = student.guardianPhone ? toTelHref(student.guardianPhone) : null;
  const whatsapp = student.guardianPhone ? toWhatsAppHref(student.guardianPhone) : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8 text-subtle" aria-label={L.rowActions(student.fullName)}>
          <MoreVertical className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild className="min-h-10 gap-2">
          <Link href={`${fileBase}/${student.id}`}>
            <UserRound className="size-4" aria-hidden />
            {L.openFile}
          </Link>
        </DropdownMenuItem>
        {tel ? (
          <DropdownMenuItem asChild className="min-h-10 gap-2">
            <a href={tel}>
              <Phone className="size-4" aria-hidden />
              {L.call}
            </a>
          </DropdownMenuItem>
        ) : null}
        {whatsapp ? (
          <DropdownMenuItem asChild className="min-h-10 gap-2">
            <a href={whatsapp} target="_blank" rel="noreferrer">
              <MessageCircle className="size-4" aria-hidden />
              {L.whatsapp}
            </a>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
