import { renderToBuffer } from "@react-pdf/renderer";

import { requireRole } from "@/lib/auth/session";
import { getCashSessionSummary } from "@/lib/data/cash";
import { getLabels } from "@/lib/i18n/server";
import { CashReportPdf } from "@/lib/pdf/cash-report-pdf";
import { getCenterPdfBrand } from "@/lib/pdf/center-brand";
import { createClient } from "@/lib/supabase/server";

/** Rapport de caisse d'une journée, à la marque du centre (admin, hors mode support). */
export async function GET(_request: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return new Response(null, { status: 404 });
  const profile = await requireRole("admin");
  if (profile.support) return new Response(null, { status: 404 });

  // RLS : l'admin lit toutes les sessions de son centre.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cash_sessions")
    .select("id")
    .eq("center_id", profile.centerId)
    .eq("session_date", date)
    .order("opened_at", { ascending: true });
  if (error) return new Response(null, { status: 500 });

  const [LABELS, brand, sessions] = await Promise.all([
    getLabels(),
    getCenterPdfBrand(),
    Promise.all(data.map((row) => getCashSessionSummary(row.id))),
  ]);
  const buffer = await renderToBuffer(CashReportPdf({ brand, labels: LABELS, date, sessions, generatedAt: new Date() }));
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="rapport-de-caisse-${date}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
