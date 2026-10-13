import "server-only";

import { Document, Font, Image, Page, StyleSheet, View } from "@react-pdf/renderer";

import type { AppLabels } from "@/lib/constants/labels";
import type { PayrollLineView, PayrollView } from "@/lib/data/payroll";
import { formatDate, formatDateTime, formatMonth } from "@/lib/format";
import type { Locale } from "@/lib/i18n/locale";
import { formatRate, monthKey, type PayrollMonth } from "@/lib/payroll";
import { PdfEditedWith, pdfHeaderLogo } from "@/lib/pdf/dirassty";
import { pdfAmount, pdfText, type PdfTypeface, pdfTypeface } from "@/lib/pdf/fonts";
import { ContactLine, Text } from "@/lib/pdf/text";

Font.registerHyphenationCallback((word) => [word]);

function money(amount: number, locale: Locale): string {
  return pdfAmount(amount, locale);
}

function signed(amount: number, locale: Locale): string {
  return pdfAmount(amount, locale, true);
}

/** « Octobre 2026 » ; « October 2026 » */
function monthLabel(value: PayrollMonth, locale: Locale): string {
  const label = formatMonth(`${monthKey(value)}-01`, locale);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const INK = "#3b3f5c";
const MUTED = "#8a90a6";
const LINE = "#e4e6ef";

/** Styles du document : polices de la langue ; rangées, alignements et blocs de fin mirrorés en arabe. */
function createStyles(t: PdfTypeface) {
  return StyleSheet.create({
    page: { padding: 36, fontSize: 9, fontFamily: t.regular, color: INK, ...(t.rtl ? { textAlign: "right" as const } : {}) },
    header: { flexDirection: t.row, alignItems: "center", gap: 10, paddingBottom: 10, borderBottomWidth: 2, marginBottom: 14 },
    logo: { width: 36, height: 36, objectFit: "contain" },
    brand: { fontSize: 13, fontFamily: t.bold },
    muted: { color: MUTED },
    title: { fontSize: 16, fontFamily: t.bold, marginBottom: 2 },
    fields: { flexDirection: t.row, gap: 24, marginVertical: 12 },
    fieldLabel: { fontSize: 7.5, color: MUTED, marginBottom: 2 },
    fieldValue: { fontSize: 10, fontFamily: t.bold },
    headRow: { flexDirection: t.row, borderBottomWidth: 1, paddingBottom: 4, marginBottom: 2, fontFamily: t.bold },
    row: { flexDirection: t.row, borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 5 },
    right: { textAlign: t.end },
    bold: { fontFamily: t.bold },
    totals: { marginTop: 10, gap: 4, alignSelf: t.alignEnd, width: 230 },
    totalRow: { flexDirection: t.row, justifyContent: "space-between" },
    grand: { flexDirection: t.row, justifyContent: "space-between", borderTopWidth: 1, paddingTop: 5, fontSize: 12, fontFamily: t.bold },
    signature: { marginTop: 40, alignSelf: t.alignEnd, width: 200, borderTopWidth: 0.5, paddingTop: 4, color: MUTED, textAlign: "center" },
    footer: { position: "absolute", bottom: 24, left: 36, right: 36, flexDirection: t.row, justifyContent: "space-between", fontSize: 7.5, color: MUTED },
  });
}

type Styles = ReturnType<typeof createStyles>;

export type PayrollPdfBrand = { name: string; contact: string | null; logoUrl: string | null; color: string; whiteLabel: boolean };

function Header({ brand, styles, rtl }: { brand: PayrollPdfBrand; styles: Styles; rtl: boolean }) {
  const logo = pdfHeaderLogo(brand.logoUrl, brand.whiteLabel);
  return (
    <View style={[styles.header, { borderBottomColor: brand.color }]}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- composant PDF, pas d'image HTML */}
      {logo ? <Image src={logo} style={styles.logo} /> : null}
      <View>
        <Text rtl={rtl} style={[styles.brand, { color: brand.color }]}>{brand.name}</Text>
        {brand.contact ? <ContactLine rtl={rtl} style={styles.muted} text={brand.contact} /> : null}
      </View>
    </View>
  );
}

function Footer({ brand, labels, generatedAt, styles, rtl }: { brand: PayrollPdfBrand; labels: AppLabels; generatedAt: Date; styles: Styles; rtl: boolean }) {
  return (
    <View style={styles.footer} fixed>
      <Text rtl={rtl}>{brand.name}</Text>
      <PdfEditedWith whiteLabel={brand.whiteLabel} label={labels.receipts.editedWith} rtl={rtl} />
      <Text rtl={rtl}>{labels.payroll.pdf.generatedAt(formatDateTime(generatedAt))}</Text>
    </View>
  );
}

function modeLabel(line: PayrollLineView, labels: AppLabels): string {
  return line.payMode ? labels.payroll.modes[line.payMode] : labels.payroll.modes.none;
}

/** Fiche de paie individuelle, dans la langue des libellés fournis. */
export function PayslipPdf({
  brand,
  labels,
  locale,
  payroll,
  line,
  generatedAt,
}: {
  brand: PayrollPdfBrand;
  labels: AppLabels;
  locale: Locale;
  payroll: PayrollView;
  line: PayrollLineView;
  generatedAt: Date;
}) {
  const P = labels.payroll;
  const D = P.detail;
  const detail = line.detail;
  const cols = [3, 2.2, 1.6, 1, 1, 1.6];
  const typeface = pdfTypeface(locale);
  const styles = createStyles(typeface);
  const rtl = typeface.rtl;

  return (
    <Document title={`${P.pdf.payslipTitle} — ${line.teacherName}`} language={locale} author={brand.name} creator={brand.name} producer={brand.name}>
      <Page size="A4" style={styles.page}>
        <Header brand={brand} styles={styles} rtl={rtl} />
        <Text rtl={rtl} style={styles.title}>{P.pdf.payslipTitle}</Text>
        <Text rtl={rtl} style={styles.muted}>{P.status[payroll.status]}</Text>

        <View style={styles.fields}>
          <View>
            <Text rtl={rtl} style={styles.fieldLabel}>{P.pdf.teacher}</Text>
            <Text rtl={rtl} style={styles.fieldValue}>{line.teacherName}</Text>
            <Text rtl={rtl} style={styles.muted}>{labels.roles[line.memberRole]}</Text>
          </View>
          <View>
            <Text rtl={rtl} style={styles.fieldLabel}>{P.pdf.period}</Text>
            <Text rtl={rtl} style={styles.fieldValue}>{monthLabel(payroll.month, locale)}</Text>
          </View>
          <View>
            <Text rtl={rtl} style={styles.fieldLabel}>{P.columns.mode}</Text>
            <Text rtl={rtl} style={styles.fieldValue}>{modeLabel(line, labels)}</Text>
          </View>
        </View>

        {detail.kind === "commission" && detail.subjects.length > 0 ? (
          <View>
            <View style={styles.headRow}>
              <Text rtl={rtl} style={{ flex: cols[0] }}>{D.subject}</Text>
              <Text rtl={rtl} style={{ flex: cols[1] }}>{D.level}</Text>
              <Text rtl={rtl} style={[{ flex: cols[2] }, styles.right]}>{D.price}</Text>
              <Text rtl={rtl} style={[{ flex: cols[3] }, styles.right]}>{D.enrolled}</Text>
              <Text rtl={rtl} style={[{ flex: cols[4] }, styles.right]}>{D.rate}</Text>
              <Text rtl={rtl} style={[{ flex: cols[5] }, styles.right]}>{D.subtotal}</Text>
            </View>
            {detail.subjects.map((subject) => (
              <View key={subject.subjectId} style={styles.row} wrap={false}>
                <Text rtl={rtl} style={{ flex: cols[0] }}>{subject.subject}</Text>
                <Text rtl={rtl} style={{ flex: cols[1] }}>{subject.level}</Text>
                <Text rtl={rtl} style={[{ flex: cols[2] }, styles.right]}>{money(subject.monthlyPrice, locale)}</Text>
                <Text rtl={rtl} style={[{ flex: cols[3] }, styles.right]}>{subject.enrolled}</Text>
                <Text rtl={rtl} style={[{ flex: cols[4] }, styles.right]}>{subject.ratePercent === null ? "-" : pdfText(formatRate(subject.ratePercent, locale))}</Text>
                <Text rtl={rtl} style={[{ flex: cols[5] }, styles.right]}>{money(subject.subtotal, locale)}</Text>
              </View>
            ))}
            <Text rtl={rtl} style={[styles.muted, { marginTop: 6 }]}>{D.fullPriceNote}</Text>
          </View>
        ) : detail.kind === "fixed_salary" ? (
          <Text rtl={rtl}>
            {detail.monthlyAmount !== null && detail.effectiveFrom
              ? D.salary(money(detail.monthlyAmount, locale), formatDate(detail.effectiveFrom))
              : D.noSalary}
          </Text>
        ) : null}

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text rtl={rtl} style={styles.muted}>{P.columns.computed}</Text>
            <Text rtl={rtl}>{money(line.computed, locale)}</Text>
          </View>
          {line.adjustment !== 0 ? (
            <View style={styles.totalRow}>
              <Text rtl={rtl} style={styles.muted}>
                {P.columns.adjustment}
                {line.adjustmentReason ? ` (${line.adjustmentReason})` : ""}
              </Text>
              <Text rtl={rtl}>{signed(line.adjustment, locale)}</Text>
            </View>
          ) : null}
          <View style={styles.grand}>
            <Text rtl={rtl}>{P.columns.final}</Text>
            <Text rtl={rtl} style={{ color: brand.color }}>{money(line.final, locale)}</Text>
          </View>
          {line.paidAt && line.paymentMethod ? (
            <Text rtl={rtl} style={[styles.muted, styles.right]}>{P.paidOn(formatDate(line.paidAt), labels.paymentMethods[line.paymentMethod])}</Text>
          ) : null}
        </View>

        <Text rtl={rtl} style={styles.signature}>{P.pdf.signature}</Text>
        <Footer brand={brand} labels={labels} generatedAt={generatedAt} styles={styles} rtl={rtl} />
      </Page>
    </Document>
  );
}

/** Récapitulatif mensuel de la paie, dans la langue des libellés fournis. */
export function PayrollSummaryPdf({
  brand,
  labels,
  locale,
  payroll,
  generatedAt,
}: {
  brand: PayrollPdfBrand;
  labels: AppLabels;
  locale: Locale;
  payroll: PayrollView;
  generatedAt: Date;
}) {
  const P = labels.payroll;
  const C = P.columns;
  const cols = [3, 1.6, 1.4, 1.4, 1.4, 2.2];
  const typeface = pdfTypeface(locale);
  const styles = createStyles(typeface);
  const rtl = typeface.rtl;

  return (
    <Document title={`${P.pdf.summaryTitle} — ${monthLabel(payroll.month, locale)}`} language={locale} author={brand.name} creator={brand.name} producer={brand.name}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Header brand={brand} styles={styles} rtl={rtl} />
        <Text rtl={rtl} style={styles.title}>
          {P.pdf.summaryTitle} — {monthLabel(payroll.month, locale)}
        </Text>
        <Text rtl={rtl} style={[styles.muted, { marginBottom: 12 }]}>{P.status[payroll.status]}</Text>

        <View style={styles.headRow}>
          <Text rtl={rtl} style={{ flex: cols[0] }}>{C.teacher}</Text>
          <Text rtl={rtl} style={{ flex: cols[1] }}>{C.mode}</Text>
          <Text rtl={rtl} style={[{ flex: cols[2] }, styles.right]}>{C.computed}</Text>
          <Text rtl={rtl} style={[{ flex: cols[3] }, styles.right]}>{C.adjustment}</Text>
          <Text rtl={rtl} style={[{ flex: cols[4] }, styles.right]}>{C.final}</Text>
          <Text rtl={rtl} style={[{ flex: cols[5] }, styles.right]}>{C.payment}</Text>
        </View>
        {payroll.lines.map((line) => (
          <View key={line.id} style={styles.row} wrap={false}>
            <View style={{ flex: cols[0] }}>
              <Text rtl={rtl}>{line.teacherName}</Text>
              {line.adjustmentReason ? <Text rtl={rtl} style={styles.muted}>{line.adjustmentReason}</Text> : null}
            </View>
            <Text rtl={rtl} style={{ flex: cols[1] }}>{modeLabel(line, labels)}</Text>
            <Text rtl={rtl} style={[{ flex: cols[2] }, styles.right]}>{money(line.computed, locale)}</Text>
            <Text rtl={rtl} style={[{ flex: cols[3] }, styles.right]}>{line.adjustment === 0 ? "-" : signed(line.adjustment, locale)}</Text>
            <Text rtl={rtl} style={[{ flex: cols[4] }, styles.right, styles.bold]}>{money(line.final, locale)}</Text>
            <Text rtl={rtl} style={[{ flex: cols[5] }, styles.right]}>
              {line.paidAt && line.paymentMethod ? P.paidOn(formatDate(line.paidAt), labels.paymentMethods[line.paymentMethod]) : "-"}
            </Text>
          </View>
        ))}
        <View style={[styles.grand, { marginTop: 8 }]}>
          <Text rtl={rtl}>{P.total}</Text>
          <Text rtl={rtl} style={{ color: brand.color }}>{money(payroll.total, locale)}</Text>
        </View>
        <Footer brand={brand} labels={labels} generatedAt={generatedAt} styles={styles} rtl={rtl} />
      </Page>
    </Document>
  );
}
