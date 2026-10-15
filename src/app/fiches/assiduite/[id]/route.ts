import { renderToBuffer } from "@react-pdf/renderer";

import { getAuthState } from "@/lib/auth/session";
import { parseAttendanceFilters, periodStart, summarizeAttendance } from "@/lib/attendance";
import { getSessionBrand } from "@/lib/branding";
import { familyLabelsFor } from "@/lib/constants/labels";
import { getAttendanceData } from "@/lib/data/attendance";
import { type FamilyContext, getFamilyContext, getStudentMessageLocale } from "@/lib/data/family-locale";
import { toISODate } from "@/lib/format";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/locale";
import { getVocabularyTerms } from "@/lib/i18n/server";
import { AttendancePdf } from "@/lib/pdf/attendance-pdf";
import { createClient } from "@/lib/supabase/server";

/**
 * Langue et libellés de la famille hors accueil et administration (professeur, support) : même règle
 * que `getFamilyContext` (langue de l'élève, sinon celle du centre), qui passe par `requireStaff` et
 * renverrait un professeur vers son accueil au lieu de produire la fiche.
 */
async function readFamilyContext(studentId: string, centerId: string | null): Promise<FamilyContext> {
  const supabase = await createClient();
  const [own, center, terms, brand] = await Promise.all([
    getStudentMessageLocale(studentId),
    centerId ? supabase.from("centers").select("family_locale").eq("id", centerId).maybeSingle() : null,
    getVocabularyTerms(),
    getSessionBrand(),
  ]);
  const centerLocale = isLocale(center?.data?.family_locale) ? center.data.family_locale : DEFAULT_LOCALE;
  const locale = own ?? centerLocale;
  return { locale, labels: familyLabelsFor(terms, brand.whiteLabel ? brand.name : null, locale) };
}

/**
 * Fiche d'assiduité en PDF, remise à la famille : dans sa langue (fiche de l'élève, sinon réglages
 * du centre). Accès : administrateur et assistant du centre de l'élève, professeur (ses matières
 * uniquement), filtré en base.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const state = await getAuthState();
  if (state.status !== "authenticated" || !state.profile.active || (state.profile.blocked && !state.profile.support)) {
    return new Response(null, { status: 401 });
  }
  if (!/^[0-9a-f-]{36}$/.test(id) || !state.profile.modules.includes("absence_tracking")) return new Response(null, { status: 404 });

  const data = await getAttendanceData(id);
  if (!data.student) return new Response(null, { status: 404 });

  const filters = parseAttendanceFilters(Object.fromEntries(new URL(request.url).searchParams));
  const summary = summarizeAttendance(data.records, { from: periodStart(filters.period), subjectId: filters.subjectId });
  const [{ locale, labels }, brand] = await Promise.all([
    state.profile.role === "admin" || state.profile.role === "assistant" ? getFamilyContext(id) : readFamilyContext(id, state.profile.centerId),
    getSessionBrand(),
  ]);
  const subjectName = filters.subjectId ? data.records.find((r) => r.subjectId === filters.subjectId)?.subjectName : null;

  const buffer = await renderToBuffer(
    // Appel direct : le composant renvoie l'élément <Document> attendu par le moteur PDF.
    AttendancePdf({
      labels,
      locale,
      brandName: brand.whiteLabel ? brand.name : state.profile.centerName || brand.name,
      logoUrl: brand.logoUrl && /\.(png|jpe?g)$/i.test(brand.logoUrl) ? brand.logoUrl : null,
      whiteLabel: brand.whiteLabel,
      color: brand.colors.primary ?? "#6c2bf5",
      student: data.student,
      periodLabel: labels.attendanceSheet.periods[filters.period],
      subjectLabel: subjectName ?? labels.attendanceSheet.allSubjects,
      summary,
      followUps: state.profile.role === "teacher" ? [] : data.followUps,
      generatedAt: new Date(),
    }),
  );

  const fileName = `assiduite-${data.student.fullName.normalize("NFD").replace(/[^\w]+/g, "-").replace(/-+$/, "").toLowerCase()}-${toISODate(new Date())}.pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
