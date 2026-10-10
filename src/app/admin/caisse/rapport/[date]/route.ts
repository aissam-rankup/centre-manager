import { renderToBuffer } from "@react-pdf/renderer";

import { requireRole } from "@/lib/auth/session";
import { getCashSessionSummary } from "@/lib/data/cash";
import { CashReportPdf } from "@/lib/pdf/cash-report-pdf";
import { getStaffPdfContext } from "@/lib/pdf/center-brand";
import { createClient } from "@/lib/supabase/server";

/** « 2026-02-31 », « 0000-01-01 » : pas une date du calendrier (la base les refuserait). */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const parsed = new Date(`${value}T00:00:00Z`);
  return year >= 2000 && year <= 2100 && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Rapport de caisse d'une journée, à la marque du centre (admin, hors mode support), dans la langue de l'utilisateur. */
export async function GET(_request: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isCalendarDate(date)) return new Response(null, { status: 404 });
  const profile = await requireRole("admin");
  if (profile.support || !profile.modules.includes("finance")) return new Response(null, { status: 404 });

  // RLS : l'admin lit toutes les sessions de son centre.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cash_sessions")
    .select("id")
    .eq("center_id", profile.centerId)
    .eq("session_date", date)
    .order("opened_at", { ascending: true });
  if (error) return new Response(null, { status: 500 });

  const [pdf, sessions] = await Promise.all([getStaffPdfContext(), Promise.all(data.map((row) => getCashSessionSummary(row.id)))]);
  const buffer = await renderToBuffer(CashReportPdf({ ...pdf, date, sessions, generatedAt: new Date() }));
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="rapport-de-caisse-${date}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
