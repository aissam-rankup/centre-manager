import "server-only";

import { z } from "zod";

import { requireStaff } from "@/lib/auth/session";
import type { CashSessionSummary } from "@/lib/cash";
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
  /** Session ouverte aujourd'hui (la commune, ou la sienne). */
  current: CashSessionSummary | null;
  /** Sessions d'un jour précédent restées ouvertes. */
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
  // La caisse de l'utilisateur : la commune, ou la sienne (l'admin voit les autres dans l'historique).
  const mine = sessions.data.filter((session) => (perAssistant ? session.assistant_id === profile.id : session.is_shared));
  const summaries = await Promise.all(mine.map((session) => getCashSessionSummary(session.id)));

  return {
    support: false,
    perAssistant,
    finance: profile.role === "admin",
    current: summaries.find((session) => session.status === "open" && session.sessionDate === todayIso) ?? null,
    stale: summaries.filter((session) => session.status === "open" && session.sessionDate < todayIso),
    closedToday: summaries.filter((session) => session.status !== "open" && session.sessionDate === todayIso).reverse(),
  };
}

/** Encaissement : faut-il demander le fonds de caisse (aucune session ouverte aujourd'hui) ? */
export async function needsCashOpening(): Promise<boolean> {
  const profile = await requireStaff();
  if (profile.support) return false;
  const supabase = await createClient();
  const todayIso = toISODate(today());
  const [center, sessions] = await Promise.all([
    supabase.from("centers").select("cash_session_per_assistant").eq("id", profile.centerId).single(),
    supabase
      .from("cash_sessions")
      .select("id, is_shared, assistant_id")
      .eq("center_id", profile.centerId)
      .eq("status", "open")
      .eq("session_date", todayIso),
  ]);
  if (center.error) throw center.error;
  if (sessions.error) throw sessions.error;
  const perAssistant = center.data.cash_session_per_assistant;
  return !sessions.data.some((session) => (perAssistant ? session.assistant_id === profile.id : session.is_shared));
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
