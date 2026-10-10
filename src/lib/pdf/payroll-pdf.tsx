import "server-only";

import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import type { AppLabels } from "@/lib/constants/labels";
import type { PayrollLineView, PayrollView } from "@/lib/data/payroll";
import { formatDate, formatDateTime, formatMAD, formatMonth } from "@/lib/format";
import type { Locale } from "@/lib/i18n/locale";
import { formatRate, monthKey, type PayrollMonth } from "@/lib/payroll";
import { PdfEditedWith, pdfHeaderLogo } from "@/lib/pdf/dirassty";

Font.registerHyphenationCallback((word) => [word]);

/** Montant lisible par les polices PDF standard (pas de signe moins typographique). */
function money(amount: number, locale: Locale): string {
  return formatMAD(amount, locale).replace(/−/g, "-");
}

function signed(amount: number, locale: Locale): string {
  return amount === 0 ? money(0, locale) : `${amount > 0 ? "+" : "-"} ${money(Math.abs(amount), locale)}`;
}

/** « Octobre 2026 » ; « October 2026 » */
function monthLabel(value: PayrollMonth, locale: Locale): string {
  const label = formatMonth(`${monthKey(value)}-01`, locale);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const INK = "#3b3f5c";
const MUTED = "#8a90a6";
const LINE = "#e4e6ef";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: INK },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 10, borderBottomWidth: 2, marginBottom: 14 },
  logo: { width: 36, height: 36, objectFit: "contain" },
  brand: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  muted: { color: MUTED },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  fields: { flexDirection: "row", gap: 24, marginVertical: 12 },
  fieldLabel: { fontSize: 7.5, color: MUTED, marginBottom: 2 },
  fieldValue: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  headRow: { flexDirection: "row", borderBottomWidth: 1, paddingBottom: 4, marginBottom: 2, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 5 },
  right: { textAlign: "right" },
  totals: { marginTop: 10, gap: 4, alignSelf: "flex-end", width: 230 },
  totalRow: { flexDirection: "row", justifyContent: "space-between" },
  grand: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, paddingTop: 5, fontSize: 12, fontFamily: "Helvetica-Bold" },
  signature: { marginTop: 40, alignSelf: "flex-end", width: 200, borderTopWidth: 0.5, paddingTop: 4, color: MUTED, textAlign: "center" },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: MUTED },
});

export type PayrollPdfBrand = { name: string; contact: string | null; logoUrl: string | null; color: string; whiteLabel: boolean };

function Header({ brand }: { brand: PayrollPdfBrand }) {
  const logo = pdfHeaderLogo(brand.logoUrl, brand.whiteLabel);
  return (
    <View style={[styles.header, { borderBottomColor: brand.color }]}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- composant PDF, pas d'image HTML */}
      {logo ? <Image src={logo} style={styles.logo} /> : null}
      <View>
        <Text style={[styles.brand, { color: brand.color }]}>{brand.name}</Text>
        {brand.contact ? <Text style={styles.muted}>{brand.contact}</Text> : null}
      </View>
    </View>
  );
}

function Footer({ brand, labels, generatedAt }: { brand: PayrollPdfBrand; labels: AppLabels; generatedAt: Date }) {
  return (
    <View style={styles.footer} fixed>
      <Text>{brand.name}</Text>
      <PdfEditedWith whiteLabel={brand.whiteLabel} label={labels.receipts.editedWith} />
      <Text>{labels.payroll.pdf.generatedAt(formatDateTime(generatedAt))}</Text>
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

  return (
    <Document title={`${P.pdf.payslipTitle} — ${line.teacherName}`} language={locale} author={brand.name} creator={brand.name} producer={brand.name}>
      <Page size="A4" style={styles.page}>
        <Header brand={brand} />
        <Text style={styles.title}>{P.pdf.payslipTitle}</Text>
        <Text style={styles.muted}>{P.status[payroll.status]}</Text>

        <View style={styles.fields}>
          <View>
            <Text style={styles.fieldLabel}>{P.pdf.teacher}</Text>
            <Text style={styles.fieldValue}>{line.teacherName}</Text>
          </View>
          <View>
            <Text style={styles.fieldLabel}>{P.pdf.period}</Text>
            <Text style={styles.fieldValue}>{monthLabel(payroll.month, locale)}</Text>
          </View>
          <View>
            <Text style={styles.fieldLabel}>{P.columns.mode}</Text>
            <Text style={styles.fieldValue}>{modeLabel(line, labels)}</Text>
          </View>
        </View>

        {detail.kind === "commission" && detail.subjects.length > 0 ? (
          <View>
            <View style={styles.headRow}>
              <Text style={{ flex: cols[0] }}>{D.subject}</Text>
              <Text style={{ flex: cols[1] }}>{D.level}</Text>
              <Text style={[{ flex: cols[2] }, styles.right]}>{D.price}</Text>
              <Text style={[{ flex: cols[3] }, styles.right]}>{D.enrolled}</Text>
              <Text style={[{ flex: cols[4] }, styles.right]}>{D.rate}</Text>
              <Text style={[{ flex: cols[5] }, styles.right]}>{D.subtotal}</Text>
            </View>
            {detail.subjects.map((subject) => (
              <View key={subject.subjectId} style={styles.row} wrap={false}>
                <Text style={{ flex: cols[0] }}>{subject.subject}</Text>
                <Text style={{ flex: cols[1] }}>{subject.level}</Text>
                <Text style={[{ flex: cols[2] }, styles.right]}>{money(subject.monthlyPrice, locale)}</Text>
                <Text style={[{ flex: cols[3] }, styles.right]}>{subject.enrolled}</Text>
                <Text style={[{ flex: cols[4] }, styles.right]}>{subject.ratePercent === null ? "-" : formatRate(subject.ratePercent, locale)}</Text>
                <Text style={[{ flex: cols[5] }, styles.right]}>{money(subject.subtotal, locale)}</Text>
              </View>
            ))}
            <Text style={[styles.muted, { marginTop: 6 }]}>{D.fullPriceNote}</Text>
          </View>
        ) : detail.kind === "fixed_salary" ? (
          <Text>
            {detail.monthlyAmount !== null && detail.effectiveFrom
              ? D.salary(money(detail.monthlyAmount, locale), formatDate(detail.effectiveFrom))
              : D.noSalary}
          </Text>
        ) : null}

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.muted}>{P.columns.computed}</Text>
            <Text>{money(line.computed, locale)}</Text>
          </View>
          {line.adjustment !== 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.muted}>
                {P.columns.adjustment}
                {line.adjustmentReason ? ` (${line.adjustmentReason})` : ""}
              </Text>
              <Text>{signed(line.adjustment, locale)}</Text>
            </View>
          ) : null}
          <View style={styles.grand}>
            <Text>{P.columns.final}</Text>
            <Text style={{ color: brand.color }}>{money(line.final, locale)}</Text>
          </View>
          {line.paidAt && line.paymentMethod ? (
            <Text style={[styles.muted, styles.right]}>{P.paidOn(formatDate(line.paidAt), labels.paymentMethods[line.paymentMethod])}</Text>
          ) : null}
        </View>

        <Text style={styles.signature}>{P.pdf.signature}</Text>
        <Footer brand={brand} labels={labels} generatedAt={generatedAt} />
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

  return (
    <Document title={`${P.pdf.summaryTitle} — ${monthLabel(payroll.month, locale)}`} language={locale} author={brand.name} creator={brand.name} producer={brand.name}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Header brand={brand} />
        <Text style={styles.title}>
          {P.pdf.summaryTitle} — {monthLabel(payroll.month, locale)}
        </Text>
        <Text style={[styles.muted, { marginBottom: 12 }]}>{P.status[payroll.status]}</Text>

        <View style={styles.headRow}>
          <Text style={{ flex: cols[0] }}>{C.teacher}</Text>
          <Text style={{ flex: cols[1] }}>{C.mode}</Text>
          <Text style={[{ flex: cols[2] }, styles.right]}>{C.computed}</Text>
          <Text style={[{ flex: cols[3] }, styles.right]}>{C.adjustment}</Text>
          <Text style={[{ flex: cols[4] }, styles.right]}>{C.final}</Text>
          <Text style={[{ flex: cols[5] }, styles.right]}>{C.payment}</Text>
        </View>
        {payroll.lines.map((line) => (
          <View key={line.id} style={styles.row} wrap={false}>
            <View style={{ flex: cols[0] }}>
              <Text>{line.teacherName}</Text>
              {line.adjustmentReason ? <Text style={styles.muted}>{line.adjustmentReason}</Text> : null}
            </View>
            <Text style={{ flex: cols[1] }}>{modeLabel(line, labels)}</Text>
            <Text style={[{ flex: cols[2] }, styles.right]}>{money(line.computed, locale)}</Text>
            <Text style={[{ flex: cols[3] }, styles.right]}>{line.adjustment === 0 ? "-" : signed(line.adjustment, locale)}</Text>
            <Text style={[{ flex: cols[4] }, styles.right, { fontFamily: "Helvetica-Bold" }]}>{money(line.final, locale)}</Text>
            <Text style={[{ flex: cols[5] }, styles.right]}>
              {line.paidAt && line.paymentMethod ? P.paidOn(formatDate(line.paidAt), labels.paymentMethods[line.paymentMethod]) : "-"}
            </Text>
          </View>
        ))}
        <View style={[styles.grand, { marginTop: 8 }]}>
          <Text>{P.total}</Text>
          <Text style={{ color: brand.color }}>{money(payroll.total, locale)}</Text>
        </View>
        <Footer brand={brand} labels={labels} generatedAt={generatedAt} />
      </Page>
    </Document>
  );
}
