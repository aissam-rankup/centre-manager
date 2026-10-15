import { renderToBuffer } from "@react-pdf/renderer";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { getPayroll } from "@/lib/data/payroll";
import { getStaffPdfContext } from "@/lib/pdf/center-brand";
import { PayslipPdf } from "@/lib/pdf/payroll-pdf";
import { monthKey } from "@/lib/payroll";
import { createClient } from "@/lib/supabase/server";

/** Fiche de paie d'un professeur pour un mois (admin, hors mode support), dans la langue de l'utilisateur. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response(null, { status: 404 });
  const profile = await requireRole("admin");
  if (profile.support || !profile.modules.includes("finance")) return new Response(null, { status: 404 });

  // RLS : seules les lignes du centre de l'admin sont lisibles.
  const supabase = await createClient();
  const { data: line } = await supabase
    .from("payroll_lines")
    .select("payroll_periods(year, month)")
    .eq("id", id)
    .maybeSingle();
  const period = line?.payroll_periods;
  if (!period) return new Response(null, { status: 404 });

  const [pdf, payroll] = await Promise.all([getStaffPdfContext(), getPayroll({ year: period.year, month: period.month })]);
  const view = payroll?.lines.find((item) => item.id === id);
  if (!payroll || !view) return new Response(null, { status: 404 });

  const buffer = await renderToBuffer(PayslipPdf({ ...pdf, payroll, line: view, generatedAt: new Date() }));
  const name = view.teacherName.normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="fiche-de-paie-${name}-${monthKey(payroll.month)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
