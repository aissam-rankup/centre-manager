/**
 * Période du tableau de bord de la plateforme, lue dans l'adresse :
 *   ?periode=month&mois=2026-09
 *   ?periode=quarter&trimestre=2026-Q3
 *   ?periode=year&annee=2026
 *   ?periode=custom&du=2026-09-10&au=2026-09-19
 * Les bornes et les sommes sont calculées par la base (platform_revenue_summary) ;
 * ce module ne fait que valider la demande et proposer les choix.
 */

export const PERIOD_KINDS = ["month", "quarter", "year", "custom"] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

export type PeriodSelection =
  | { kind: "month" | "quarter" | "year"; anchor: string }
  | { kind: "custom"; start: string; end: string };

export type PeriodForm = { kind: PeriodKind; month: string; quarter: string; year: string; from: string; to: string };

export type ParsedPeriod = {
  selection: PeriodSelection;
  form: PeriodForm;
  /** Période personnalisée refusée (dates manquantes, invalides ou inversées) : mois en cours affiché. */
  invalid: boolean;
};

type Params = Record<string, string | string[] | undefined>;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const QUARTER = /^(\d{4})-Q([1-4])$/;
const YEAR = /^(\d{4})$/;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function quarterOf(month: number): number {
  return Math.floor((month - 1) / 3) + 1;
}

/** Valeurs par défaut des champs : mois, trimestre et année du jour. */
function defaultsFor(todayIso: string): PeriodForm {
  const [year, month] = todayIso.split("-").map(Number);
  return {
    kind: "month",
    month: todayIso.slice(0, 7),
    quarter: `${year}-Q${quarterOf(month)}`,
    year: String(year),
    from: `${todayIso.slice(0, 7)}-01`,
    to: todayIso,
  };
}

export function parsePeriod(params: Params, todayIso: string): ParsedPeriod {
  const form = defaultsFor(todayIso);
  const current: PeriodSelection = { kind: "month", anchor: `${form.month}-01` };
  const kind = PERIOD_KINDS.find((value) => value === first(params.periode)) ?? "month";
  form.kind = kind;

  const month = first(params.mois);
  if (MONTH.test(month) && month <= form.month) form.month = month;
  const quarter = QUARTER.exec(first(params.trimestre));
  if (quarter && `${quarter[1]}-Q${quarter[2]}` <= form.quarter) form.quarter = `${quarter[1]}-Q${quarter[2]}`;
  const year = first(params.annee);
  if (YEAR.test(year) && year <= form.year) form.year = year;
  const from = first(params.du);
  const to = first(params.au);
  if (from) form.from = from;
  if (to) form.to = to;

  switch (kind) {
    case "month":
      return { selection: { kind, anchor: `${form.month}-01` }, form, invalid: false };
    case "quarter": {
      const [y, q] = form.quarter.split("-Q").map(Number);
      return { selection: { kind, anchor: `${y}-${String((q - 1) * 3 + 1).padStart(2, "0")}-01` }, form, invalid: false };
    }
    case "year":
      return { selection: { kind, anchor: `${form.year}-01-01` }, form, invalid: false };
    case "custom": {
      const valid = isIsoDate(from) && isIsoDate(to) && from <= to;
      return valid ? { selection: { kind, start: from, end: to }, form, invalid: false } : { selection: current, form, invalid: true };
    }
  }
}

/** Choix proposés : 24 derniers mois, 8 derniers trimestres, 5 dernières années. */
export function periodOptions(todayIso: string): { months: string[]; quarters: string[]; years: string[] } {
  const [year, month] = todayIso.split("-").map(Number);
  const months = Array.from({ length: 24 }, (_, index) => {
    const total = year * 12 + (month - 1) - index;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
  });
  const quarters = Array.from({ length: 8 }, (_, index) => {
    const total = year * 4 + (quarterOf(month) - 1) - index;
    return `${Math.floor(total / 4)}-Q${(total % 4) + 1}`;
  });
  const years = Array.from({ length: 5 }, (_, index) => String(year - index));
  return { months, quarters, years };
}

/** Variation : sens (hausse, baisse, stable) ; nul si aucune comparaison possible. */
export function trendOf(change: number | null): "up" | "down" | "stable" | null {
  if (change === null) return null;
  if (change > 0) return "up";
  if (change < 0) return "down";
  return "stable";
}
