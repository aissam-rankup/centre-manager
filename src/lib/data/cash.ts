import "server-only";

import { z } from "zod";

import { requireStaff } from "@/lib/auth/session";
import type { CashOpening, CashSessionSummary } from "@/lib/cash";
import { toISODate, today } from "@/lib/format";
import { PAYMENT_METHODS } from "@/lib/receipts";
import { createClient } from "@/lib/supabase/server";

const amount = z.union([z.number(), z.string()]).transform(Number);
const nullableAmount = z.union([z.number(), z.string()]).nullable().transform((value) => (value === null ? null : Number(value)));
const method = z.enum(PAYMENT_METHODS);

const summarySchema = z
  .object({
    id: z.string(),
    session_date: z.string(),
    status: z.enum(["open", "closed", "validated"]),
    is_shared: z.boolean(),
    holder_name: z.string().nullable(),
    opened_at: z.string(),
    opened_by_name: z.string().nullable(),
    opening_float: amount,
    closed_at: z.string().nullable(),
    closed_by_name: z.string().nullable(),
    validated_at: z.string().nullable(),
    validated_by_name: z.string().nullable(),
    validation_notes: z.string().nullable(),
    counted_cash: nullableAmount,
    variance: nullableAmount,
    variance_reason: z.string().nullable(),
    notes: z.string().nullable(),
    expected_cash: amount,
    by_method: z.object({ cash: amount, bank_transfer: amount, card: amount, cheque: amount }),
    transactions: z.number(),
    movements_total: amount,
    receipts: z.array(
      z.object({
        id: z.string(),
        number: z.string().nullable(),
        kind: z.enum(["payment", "cancellation"]),
        student_id: z.string().nullable(),
        student_name: z.string(),
        amount,
        method: method.nullable(),
        issued_at: z.string(),
        issued_by_name: z.string().nullable(),
      }),
    ),
    movements: z.array(
      z.object({
        id: z.string(),
        kind: z.enum(["refund", "expense", "teacher_pay", "bank_deposit", "float_change", "correction"]),
        amount,
        reason: z.string().nullable(),
        created_at: z.string(),
        created_by_name: z.string().nullable(),
        corrects_session_id: z.string().nullable(),
        corrected_session_date: z.string().nullable(),
      }),
    ),
    corrections: z.array(
      z.object({
        id: z.string(),
        amount,
        reason: z.string().nullable(),
        created_at: z.string(),
        created_by_name: z.string().nullable(),
        cash_session_id: z.string(),
        session_date: z.string(),
      }),
    ),
  })
  .transform(
    (row): CashSessionSummary => ({
      id: row.id,
      sessionDate: row.session_date,
      status: row.status,
      isShared: row.is_shared,
      holderName: row.holder_name,
      openedAt: row.opened_at,
      openedByName: row.opened_by_name,
      openingFloat: row.opening_float,
      closedAt: row.closed_at,
      closedByName: row.closed_by_name,
      validatedAt: row.validated_at,
      validatedByName: row.validated_by_name,
      validationNotes: row.validation_notes,
      countedCash: row.counted_cash,
      variance: row.variance,
      varianceReason: row.variance_reason,
      notes: row.notes,
      expectedCash: row.expected_cash,
      byMethod: row.by_method,
      transactions: row.transactions,
      movementsTotal: row.movements_total,
      receipts: row.receipts.map((receipt) => ({
        id: receipt.id,
        number: receipt.number ?? "",
        kind: receipt.kind,
        studentId: receipt.student_id,
        studentName: receipt.student_name,
        amount: receipt.amount,
        method: receipt.method,
        issuedAt: receipt.issued_at,
        issuedByName: receipt.issued_by_name,
      })),
      movements: row.movements.map((movement) => ({
        id: movement.id,
        kind: movement.kind,
        amount: movement.amount,
        reason: movement.reason,
        createdAt: movement.created_at,
        createdByName: movement.created_by_name,
        correctsSessionId: movement.corrects_session_id,
        correctedSessionDate: movement.corrected_session_date,
      })),
      corrections: row.corrections.map((correction) => ({
        id: correction.id,
        amount: correction.amount,
        reason: correction.reason,
        createdAt: correction.created_at,
        createdByName: correction.created_by_name,
        cashSessionId: correction.cash_session_id,
        sessionDate: correction.session_date,
      })),
    }),
  );

/** Détail d'une session (accueil : la commune ou la sienne ; admin : toutes). */
export async function getCashSessionSummary(sessionId: string): Promise<CashSessionSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cash_session_summary", { p_session_id: sessionId });
  if (error) throw error;
  return summarySchema.parse(data);
}

export type CashPage = {
  /** Super-admin en support : la caisse n'est pas consultable. */
  support: boolean;
  perAssistant: boolean;
  /** Admin : charges et paie en espèces. */
  finance: boolean;
  /** Session ouverte aujourd'hui selon le réglage (la commune, ou la sienne) : les encaissements y vont. */
  current: CashSessionSummary | null;
  /** Autres sessions ouvertes à clôturer : d'un jour précédent, ou ouvertes avant un changement de réglage. */
  stale: CashSessionSummary[];
  /** Sessions clôturées aujourd'hui. */
  closedToday: CashSessionSummary[];
};

/** Écran de caisse : la session du jour de l'utilisateur, celles à clôturer, celles du jour déjà clôturées. */
export async function getCashPage(): Promise<CashPage> {
  const profile = await requireStaff();
  if (profile.support) return { support: true, perAssistant: false, finance: false, current: null, stale: [], closedToday: [] };
  const supabase = await createClient();
  const todayIso = toISODate(today());

  const [center, sessions] = await Promise.all([
    supabase.from("centers").select("cash_session_per_assistant").eq("id", profile.centerId).single(),
    supabase
      .from("cash_sessions")
      .select("id, session_date, status, is_shared, assistant_id")
      .eq("center_id", profile.centerId)
      .or(`session_date.eq.${todayIso},status.eq.open`)
      .order("opened_at", { ascending: true }),
  ]);
  if (center.error) throw center.error;
  if (sessions.error) throw sessions.error;

  const perAssistant = center.data.cash_session_per_assistant;
  // Les caisses de l'utilisateur : la commune et la sienne, quel que soit le réglage actuel
  // (l'admin voit celles des autres dans l'historique).
  const mine = sessions.data.filter((session) => session.is_shared || session.assistant_id === profile.id);
  const summaries = await Promise.all(mine.map((session) => getCashSessionSummary(session.id)));
  const isCurrent = (session: CashSessionSummary) =>
    session.status === "open" && session.sessionDate === todayIso && (perAssistant ? !session.isShared : session.isShared);
  const current = summaries.find(isCurrent) ?? null;

  return {
    support: false,
    perAssistant,
    finance: profile.role === "admin",
    current,
    stale: summaries.filter((session) => session.status === "open" && session.id !== current?.id),
    closedToday: summaries.filter((session) => session.status !== "open" && session.sessionDate === todayIso).reverse(),
  };
}

/** Encaissement : faut-il demander le fonds de caisse (aucune session ouverte aujourd'hui) ? */
/** Fonds de caisse à demander avec un paiement : pas de caisse ouverte, ou ouverte sans encaissement. */
export async function getCashOpening(): Promise<CashOpening> {
  const profile = await requireStaff();
  if (profile.support) return { needed: false, currentFloat: 0 };
  const supabase = await createClient();
  const todayIso = toISODate(today());
  const [center, sessions] = await Promise.all([
    supabase.from("centers").select("cash_session_per_assistant").eq("id", profile.centerId).single(),
    supabase
      .from("cash_sessions")
      .select("id, is_shared, assistant_id, opening_float")
      .eq("center_id", profile.centerId)
      .eq("status", "open")
      .eq("session_date", todayIso),
  ]);
  if (center.error) throw center.error;
  if (sessions.error) throw sessions.error;
  const perAssistant = center.data.cash_session_per_assistant;
  const current = sessions.data.find((session) => (perAssistant ? session.assistant_id === profile.id : session.is_shared));
  if (!current) return { needed: true, currentFloat: 0 };
  // Caisse ouverte par une annulation ou un mouvement : le fonds reste à saisir jusqu'au premier encaissement.
  const { count, error } = await supabase
    .from("receipts")
    .select("id", { count: "exact", head: true })
    .eq("cash_session_id", current.id)
    .eq("kind", "payment");
  if (error) throw error;
  return { needed: (count ?? 0) === 0, currentFloat: Number(current.opening_float) };
}

export type CashSettings = { perAssistant: boolean; threshold: number };

/** Réglages de caisse du centre (admin). */
export async function getCashSettings(): Promise<CashSettings> {
  const profile = await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("centers")
    .select("cash_session_per_assistant, cash_variance_alert_threshold")
    .eq("id", profile.centerId)
    .single();
  if (error) throw error;
  return { perAssistant: data.cash_session_per_assistant, threshold: Number(data.cash_variance_alert_threshold) };
}

export type CashHistoryRow = {
  id: string;
  sessionDate: string;
  status: "open" | "closed" | "validated";
  isShared: boolean;
  holderName: string | null;
  openedByName: string | null;
  closedByName: string | null;
  validatedByName: string | null;
  totalCollected: number;
  cashCollected: number;
  transactions: number;
  expectedCash: number;
  countedCash: number | null;
  variance: number | null;
  varianceReason: string | null;
  corrections: number;
};

export type CashPerson = {
  name: string | null;
  sessions: number;
  exact: number;
  shortCount: number;
  surplusCount: number;
  shortage: number;
  surplus: number;
  net: number;
};

export type CashMonthOverview = {
  monthStart: string;
  sessions: number;
  exact: number;
  validated: number;
  shortage: number;
  surplus: number;
  net: number;
  collected: number;
  staleOpen: number;
  people: CashPerson[];
};

const overviewSchema = z.object({
  month_start: z.string(),
  sessions: z.number(),
  exact: z.number(),
  validated: z.number(),
  shortage: amount,
  surplus: amount,
  net: amount,
  collected: amount,
  stale_open: z.number(),
  people: z.array(
    z.object({
      name: z.string().nullable(),
      sessions: z.number(),
      exact: z.number(),
      short_count: z.number(),
      surplus_count: z.number(),
      shortage: amount,
      surplus: amount,
      net: amount,
    }),
  ),
});

/** Historique et indicateurs d'un mois (admin, hors mode support). */
export async function getCashHistory(month: { year: number; month: number }): Promise<{ rows: CashHistoryRow[]; overview: CashMonthOverview }> {
  const supabase = await createClient();
  const from = `${month.year}-${String(month.month).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
  const to = `${month.year}-${String(month.month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  const [history, overview] = await Promise.all([
    supabase.rpc("cash_session_history", { p_from: from, p_to: to }),
    supabase.rpc("cash_month_overview", { p_month: from }),
  ]);
  if (history.error) throw history.error;
  if (overview.error) throw overview.error;
  const o = overviewSchema.parse(overview.data);
  return {
    rows: history.data.map((row) => ({
      id: row.id,
      sessionDate: row.session_date,
      status: row.status,
      isShared: row.is_shared,
      holderName: row.holder_name ?? null,
      openedByName: row.opened_by_name ?? null,
      closedByName: row.closed_by_name ?? null,
      validatedByName: row.validated_by_name ?? null,
      totalCollected: Number(row.total_collected),
      cashCollected: Number(row.cash_collected),
      transactions: row.transactions,
      expectedCash: Number(row.expected_cash),
      countedCash: row.counted_cash === null ? null : Number(row.counted_cash),
      variance: row.variance === null ? null : Number(row.variance),
      varianceReason: row.variance_reason ?? null,
      corrections: Number(row.corrections),
    })),
    overview: {
      monthStart: o.month_start,
      sessions: o.sessions,
      exact: o.exact,
      validated: o.validated,
      shortage: o.shortage,
      surplus: o.surplus,
      net: o.net,
      collected: o.collected,
      staleOpen: o.stale_open,
      people: o.people.map((person) => ({
        name: person.name,
        sessions: person.sessions,
        exact: person.exact,
        shortCount: person.short_count,
        surplusCount: person.surplus_count,
        shortage: person.shortage,
        surplus: person.surplus,
        net: person.net,
      })),
    },
  };
}

export type StaleCashSession = { id: string; sessionDate: string; isShared: boolean; holderName: string | null; openedByName: string | null };

/** Caisses d'un jour précédent restées ouvertes (admin, hors support ; vide sinon). */
export async function getStaleCashSessions(): Promise<StaleCashSession[]> {
  const profile = await requireStaff();
  if (profile.support || profile.role !== "admin") return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("stale_cash_sessions");
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    sessionDate: row.session_date,
    isShared: row.is_shared,
    holderName: row.holder_name ?? null,
    openedByName: row.opened_by_name ?? null,
  }));
}
