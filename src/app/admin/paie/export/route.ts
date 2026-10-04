import { renderToBuffer } from "@react-pdf/renderer";
import type { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/session";
import { toCsv } from "@/lib/csv";
import { getPayroll } from "@/lib/data/payroll";
import { formatDate, today } from "@/lib/format";
import { getLabels } from "@/lib/i18n/server";
import { getCenterPdfBrand } from "@/lib/pdf/center-brand";
import { PayrollSummaryPdf } from "@/lib/pdf/payroll-pdf";
import { compareMonths, monthKey, parsePayrollMonth } from "@/lib/payroll";

/** Récapitulatif mensuel de la paie : ?mois=AAAA-MM&format=pdf|csv (admin, hors mode support). */
export async function GET(request: NextRequest) {
  const LABELS = await getLabels();
  const P = LABELS.payroll;
  const profile = await requireRole("admin");
  if (profile.support || !profile.modules.includes("finance")) return new Response(null, { status: 404 });

  const now = today();
  const current = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const month = parsePayrollMonth(request.nextUrl.searchParams.get("mois") ?? undefined, current);
  if (compareMonths(month, current) > 0) return new Response(null, { status: 404 });

  const payroll = await getPayroll(month);
  if (!payroll) return new Response(null, { status: 404 });
  const filename = `paie-${monthKey(month)}`;

  if (request.nextUrl.searchParams.get("format") === "csv") {
    const csv = toCsv(
      [P.columns.teacher, P.columns.mode, `${P.columns.computed} (MAD)`, `${P.columns.adjustment} (MAD)`, P.adjustment.reason, `${P.columns.final} (MAD)`, P.columns.payment],
      payroll.lines.map((line) => [
        line.teacherName,
        line.payMode ? P.modes[line.payMode] : P.modes.none,
        line.computed,
        line.adjustment,
        line.adjustmentReason ?? "",
        line.final,
        line.paidAt && line.paymentMethod ? P.paidOn(formatDate(line.paidAt), LABELS.paymentMethods[line.paymentMethod]) : "",
      ]),
    );
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const buffer = await renderToBuffer(
    PayrollSummaryPdf({ brand: await getCenterPdfBrand(), labels: LABELS, payroll, generatedAt: new Date() }),
  );
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
