import Link from "next/link";

import { cn } from "@/lib/utils";

export type FilterOption = { value: string | null; label: string };

type FilterChipsProps = {
  label: string;
  options: readonly FilterOption[];
  current: string | null;
  /** Construit l'URL d'une option (filtre porté par l'URL : partageable, sans JavaScript). */
  href: (value: string | null) => string;
};

/** Rangée de filtres en pastilles, défilante horizontalement sur mobile. */
export function FilterChips({ label, options, current, href }: FilterChipsProps) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 no-scrollbar md:mx-0 md:px-0">
      <ul className="flex w-max gap-2">
        {options.map((option) => {
          const active = option.value === current;
          return (
            <li key={option.value ?? "tous"}>
              <Link
                href={href(option.value)}
                aria-current={active ? "true" : undefined}
                scroll={false}
                className={cn(
                  "inline-flex h-11 items-center rounded-full border px-4 font-medium whitespace-nowrap transition-colors",
                  active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                )}
              >
                {option.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
