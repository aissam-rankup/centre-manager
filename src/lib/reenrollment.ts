import type { Database } from "@/lib/supabase/database.types";

export type BillingRunStatus = Database["public"]["Enums"]["billing_run_status"];

/** Campagne d'un mois, telle que résumée dans les réglages et le tableau de bord. */
export type BillingRunSummary = {
  id: string;
  year: number;
  month: number;
  status: BillingRunStatus;
  studentCount: number;
  totalExpected: number;
  generatedAt: string;
  automatic: boolean;
};

/**
 * Préparation automatique de la prochaine campagne, quand elle n'existe pas encore :
 * à une date à venir, la nuit prochaine (rattrapage), ou plus du tout ce mois-ci
 * (dernier jour du mois : le job de demain vise déjà le mois d'après).
 */
export type NextPreparation = { kind: "scheduled"; date: string } | { kind: "tonight" } | { kind: "missed" };

export type ReenrollmentSettings = {
  enabled: boolean;
  generationDay: number;
  dueDay: number;
  /** Super-admin en support : lecture seule. */
  support: boolean;
  /** Mois visé par la prochaine campagne (le mois suivant). */
  nextMonth: { year: number; month: number };
  preparation: NextPreparation;
  nextRun: BillingRunSummary | null;
  /** Campagne du mois en cours restée en brouillon : ses factures attendent la confirmation. */
  currentDraft: BillingRunSummary | null;
};

export type ReenrollmentIntent = Database["public"]["Enums"]["reenrollment_intent"];
export type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];

/** Ligne d'une campagne : une matière ou un pack d'un élève pour le mois. */
export type ReviewLine = {
  lineId: string;
  kind: "subject" | "pack";
  /** Inscription ou abonnement pack. */
  sourceId: string;
  name: string;
  periodStart: string;
  dueDate: string;
  amountFull: number;
  discountAmount: number;
  amountDue: number;
  discountConflict: boolean;
  /** Reconduite (ni élève qui part, ni matière retirée). */
  kept: boolean;
  invoiceId: string | null;
  invoiceStatus: InvoiceStatus | null;
  amountPaid: number | null;
  overdueFrom: string | null;
};

export type ReviewStudent = {
  studentId: string;
  fullName: string;
  photoUrl: string | null;
  levelName: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  intent: ReenrollmentIntent;
  reason: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  appliedAt: string | null;
  lines: ReviewLine[];
  /** Totaux des lignes reconduites. */
  amountFull: number;
  discountAmount: number;
  amountDue: number;
  overdueAmount: number;
  overdueInvoices: number;
  attendanceRate: number | null;
  attendanceCount: number;
  lowAttendance: boolean;
  atRisk: boolean;
};

export type CampaignListItem = { id: string; year: number; month: number; status: BillingRunStatus };

export type CampaignDetail = BillingRunSummary & {
  confirmedAt: string | null;
  confirmedByName: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
};

/** Intentions comptées pour le résumé de la campagne. */
export type IntentCounts = Record<ReenrollmentIntent, number>;

export function countIntents(students: readonly ReviewStudent[]): IntentCounts {
  const counts: IntentCounts = { pending: 0, confirmed: 0, dropped: 0, paused: 0 };
  for (const student of students) counts[student.intent] += 1;
  return counts;
}

/** Élève qui part ce mois-ci : aucune facture, ses matières s'arrêtent. */
export function isLeaving(intent: ReenrollmentIntent): boolean {
  return intent === "dropped" || intent === "paused";
}

/**
 * Campagne ouverte par défaut : le brouillon le plus ancien (celui qui bloque
 * des factures), sinon la plus récente.
 */
export function defaultCampaign(runs: readonly CampaignListItem[]): CampaignListItem | null {
  const drafts = runs.filter((run) => run.status === "draft");
  if (drafts.length > 0) return drafts.reduce((a, b) => (a.year * 12 + a.month <= b.year * 12 + b.month ? a : b));
  return runs[0] ?? null;
}

/** Premier jour du mois suivant la date donnée (AAAA-MM-JJ), en calendrier. */
export function nextMonthOf(todayIso: string): { year: number; month: number } {
  const [year = 0, month = 1] = todayIso.split("-").map(Number);
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Date calendaire décalée de `days` jours (AAAA-MM-JJ), mois et années compris. */
function shiftIsoDate(year: number, month: number, day: number, days: number): string {
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Échéance d'une ligne de campagne : le N-ième jour de sa période (même calcul que la base). */
export function campaignDueDate(year: number, month: number, cycleDay: 1 | 15, dueDay: number): string {
  return shiftIsoDate(year, month, cycleDay, dueDay - 1);
}

/** Quand le job quotidien préparera-t-il la campagne du mois suivant, si elle n'existe pas encore ? */
export function nextPreparation(todayIso: string, generationDay: number): NextPreparation {
  const [year = 0, month = 1, day = 1] = todayIso.split("-").map(Number);
  if (day < generationDay) return { kind: "scheduled", date: isoDate(year, month, generationDay) };
  const tomorrow = shiftIsoDate(year, month, day, 1);
  return tomorrow.slice(0, 7) === todayIso.slice(0, 7) ? { kind: "tonight" } : { kind: "missed" };
}

/** Jour saisi valide (entier de 1 à 28), sinon la valeur enregistrée. */
export function validDay(value: string, fallback: number): number {
  const day = Number(value);
  return Number.isInteger(day) && day >= 1 && day <= 28 ? day : fallback;
}
