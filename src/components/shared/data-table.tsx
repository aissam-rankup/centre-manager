import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ReactNode } from "react";

import Link from "@/components/shared/app-link";
import { cn } from "@/lib/utils";

export type DataTableColumn<Row> = {
  id: string;
  header: string;
  cell: (row: Row) => ReactNode;
  align?: "start" | "end";
  /**
   * Rôle de la colonne dans la carte mobile :
   * « title » = ligne principale, « meta » = paire libellé/valeur, « wide » = paire sur toute la largeur
   * (valeur longue non tronquée, ex. email), « aside » = coin droit, « hidden » = masquée.
   */
  mobile?: "title" | "meta" | "wide" | "aside" | "hidden";
  className?: string;
  /** Tri par lien (tableau rendu côté serveur) : adresse du tri et sens actuel (null : colonne non triée). */
  sort?: { href: string; direction: "asc" | "desc" | null; label: string };
};

type DataTableProps<Row> = {
  columns: readonly DataTableColumn<Row>[];
  rows: readonly Row[];
  getRowId: (row: Row) => string;
  caption: string;
  /** « plain » : sans cadre ni ombre, pour un tableau placé dans une carte. */
  variant?: "card" | "plain";
  /** « compact » : marges de cellule réduites (tableaux à nombreuses colonnes). */
  density?: "default" | "compact";
  className?: string;
};

/**
 * Tableau : lignes de 52 px et en-tête collant sur desktop,
 * transformé automatiquement en liste de cartes sous 768 px.
 */
export function DataTable<Row>({
  columns,
  rows,
  getRowId,
  caption,
  variant = "card",
  density = "default",
  className,
}: DataTableProps<Row>) {
  const cellPadding = density === "compact" ? "px-2.5" : "px-4";
  const titleColumns = columns.filter((c) => c.mobile === "title");
  const asideColumns = columns.filter((c) => c.mobile === "aside");
  const metaColumns = columns.filter((c) => ["meta", "wide"].includes(c.mobile ?? "meta"));

  return (
    <div className={className}>
      {/* Mobile : cartes */}
      <ul className="flex flex-col gap-3 md:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li key={getRowId(row)} className={cn("rounded-xl bg-card p-4", variant === "card" ? "shadow-card" : "border border-divider")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {titleColumns.map((column) => (
                  <div key={column.id}>{column.cell(row)}</div>
                ))}
              </div>
              {asideColumns.map((column) => (
                <div key={column.id} className="shrink-0">
                  {column.cell(row)}
                </div>
              ))}
            </div>
            {metaColumns.length > 0 ? (
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-divider pt-3">
                {metaColumns.map((column) => (
                  <div key={column.id} className={cn("flex min-w-0 flex-col", column.mobile === "wide" && "col-span-2")}>
                    <dt className="text-caption text-muted-foreground">{column.header}</dt>
                    <dd className={column.mobile === "wide" ? "break-words" : "truncate"}>{column.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </li>
        ))}
      </ul>

      {/* Desktop : tableau */}
      <div
        className={cn(
          "hidden overflow-auto md:block md:max-h-[640px]",
          variant === "card" ? "rounded-xl bg-card shadow-card" : "-mx-(--card-spacing)",
        )}
      >
        <table className="w-full border-collapse text-start text-table">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="h-12 border-b border-divider">
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={column.sort?.direction ? (column.sort.direction === "asc" ? "ascending" : "descending") : undefined}
                  className={cn(
                    cellPadding,
                    "text-table font-medium whitespace-nowrap text-heading",
                    column.align === "end" && "text-end",
                  )}
                >
                  {column.sort ? (
                    <Link
                      href={column.sort.href}
                      aria-label={column.sort.label}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-sm hover:text-primary",
                        column.align === "end" && "flex-row-reverse",
                      )}
                    >
                      {column.header}
                      {column.sort.direction === "asc" ? (
                        <ArrowUp className="size-3.5" aria-hidden />
                      ) : column.sort.direction === "desc" ? (
                        <ArrowDown className="size-3.5" aria-hidden />
                      ) : (
                        <ArrowUpDown className="size-3.5 text-subtle" aria-hidden />
                      )}
                    </Link>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={getRowId(row)} className="h-[52px] border-b border-divider transition-colors duration-150 last:border-b-0 hover:bg-row-hover">
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className={cn(cellPadding, density === "compact" ? "py-2" : "py-0", column.align === "end" && "text-end", column.className)}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
