import "server-only";

import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { toISODate, today } from "@/lib/format";
import type { BillingRunStatus } from "@/lib/reenrollment";
import { createClient } from "@/lib/supabase/server";

const amount = z.union([z.number(), z.string()]).transform(Number);
const nullableAmount = z.union([z.number(), z.string()]).nullable().transform((value) => (value === null ? null : Number(value)));

const collectionSchema = z.object({
  month_start: z.string(),
  today: z.string(),
  expected: amount,
  collected: amount,
  invoices: z.number(),
  paid_invoices: z.number(),
  previous: z.object({
    month_start: z.string(),
    expected: amount,
    collected: amount,
    collected_same_day: amount,
  }),
  days: z.array(z.object({ day: z.number(), current: nullableAmount, previous: nullableAmount })),
});

/** Jour du mois : encaissé cumulé ce mois-ci (null après aujourd'hui) et le mois précédent. */
export type CollectionDay = { day: number; current: number | null; previous: number | null };

export type CollectionOverview = {
  monthStart: string;
  today: string;
  expected: number;
  collected: number;
  invoices: number;
  paidInvoices: number;
  previous: { monthStart: string; expected: number; collected: number; collectedSameDay: number };
  days: CollectionDay[];
};

/** Recouvrement du mois (admin du centre ; null en mode support). */
export async function getCollectionOverview(): Promise<CollectionOverview | null> {
  const profile = await requireRole("admin");
  if (profile.support) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_collection_overview");
  if (error) throw error;
  const row = collectionSchema.parse(data);
  return {
    monthStart: row.month_start,
    today: row.today,
    expected: row.expected,
    collected: row.collected,
    invoices: row.invoices,
    paidInvoices: row.paid_invoices,
    previous: {
      monthStart: row.previous.month_start,
      expected: row.previous.expected,
      collected: row.previous.collected,
      collectedSameDay: row.previous.collected_same_day,
    },
    days: row.days,
  };
}

const reenrollmentSchema = z.object({
  run_id: z.string(),
  year: z.number(),
  month: z.number(),
  status: z.enum(["draft", "confirmed", "sent", "closed", "cancelled"]),
  pending: z.number(),
  confirmed: z.number(),
  dropped: z.number(),
  paused: z.number(),
  subjects_removed: z.number(),
  subjects: z.array(z.object({ kind: z.enum(["subject", "pack"]), name: z.string(), kept: z.number(), dropped: z.number() })),
});

export type ReenrollmentOverview = {
  runId: string;
  year: number;
  month: number;
  status: BillingRunStatus;
  pending: number;
  confirmed: number;
  dropped: number;
  paused: number;
  subjectsRemoved: number;
  subjects: { kind: "subject" | "pack"; name: string; kept: number; dropped: number }[];
};

/** Réinscription de la dernière campagne confirmée (sinon du brouillon) ; null sans campagne. */
export async function getReenrollmentOverview(): Promise<ReenrollmentOverview | null> {
  const profile = await requireRole("admin");
  if (!profile.modules.includes("reenrollment")) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reenrollment_overview");
  if (error) throw error;
  if (data === null) return null;
  const row = reenrollmentSchema.parse(data);
  return {
    runId: row.run_id,
    year: row.year,
    month: row.month,
    status: row.status,
    pending: row.pending,
    confirmed: row.confirmed,
    dropped: row.dropped,
    paused: row.paused,
    subjectsRemoved: row.subjects_removed,
    subjects: row.subjects,
  };
}

/** Campagne du mois en cours restée en brouillon : ses factures attendent la confirmation. */
export async function getLateDraft(): Promise<{ id: string; year: number; month: number } | null> {
  const profile = await requireRole("admin");
  // Mode support : lecture seule, rien à confirmer.
  if (profile.support || !profile.modules.includes("reenrollment")) return null;
  const supabase = await createClient();
  const [year = 0, month = 1] = toISODate(today()).split("-").map(Number);
  const { data, error } = await supabase
    .from("billing_runs")
    .select("id, period_year, period_month")
    .eq("center_id", profile.centerId)
    .eq("period_year", year)
    .eq("period_month", month)
    .eq("status", "draft")
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, year: data.period_year, month: data.period_month } : null;
}
