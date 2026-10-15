import "server-only";

import { Document, Font, Image, Page, StyleSheet, View } from "@react-pdf/renderer";

import type { AppLabels } from "@/lib/constants/labels";
import { discountBadgeLabel } from "@/lib/discounts";
import { formatDate, formatDateTime } from "@/lib/format";
import type { Locale } from "@/lib/i18n/locale";
import { PdfEditedWith, pdfHeaderLogo } from "@/lib/pdf/dirassty";
import { pdfAmount, type PdfTypeface, pdfTypeface } from "@/lib/pdf/fonts";
import { ContactLine, Text } from "@/lib/pdf/text";
import { formatPhone } from "@/lib/phone";
import { receiptPeriodLabel, type ReceiptView } from "@/lib/receipts";

// Pas de césure automatique (règles anglaises) : les mots français restent entiers.
Font.registerHyphenationCallback((word) => [word]);

/** « Motif : … » en français, « Reason: … » ailleurs. */
function labelled(label: string, value: string, locale: Locale): string {
  return `${label}${locale === "fr" ? " " : ""}: ${value}`;
}

const INK = "#3b3f5c";
const MUTED = "#8a90a6";
const LINE = "#e4e6ef";

/** Styles du reçu : polices de la langue ; rangées et alignements mirrorés en arabe. */
function createStyles(t: PdfTypeface) {
  return StyleSheet.create({
    page: { padding: 28, fontSize: 9, fontFamily: t.regular, color: INK, ...(t.rtl ? { textAlign: "right" as const } : {}) },
    header: { flexDirection: t.row, alignItems: "center", gap: 10, paddingBottom: 10, borderBottomWidth: 2, marginBottom: 12 },
    logo: { width: 36, height: 36, objectFit: "contain" },
    brandName: { fontSize: 13, fontFamily: t.bold },
    muted: { color: MUTED },
    titleRow: { flexDirection: t.row, justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
    title: { fontSize: 14, fontFamily: t.bold },
    number: { fontSize: 11, fontFamily: t.bold, textAlign: t.end },
    identity: { flexDirection: t.row, gap: 16, marginBottom: 10 },
    field: { flex: 1 },
    fieldLabel: { fontSize: 7.5, color: MUTED, marginBottom: 2 },
    fieldValue: { fontSize: 10, fontFamily: t.bold },
    line: { borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 5 },
    lineTop: { flexDirection: t.row, justifyContent: "space-between" },
    bold: { fontFamily: t.bold },
    strike: { color: MUTED, textDecoration: "line-through" },
    totals: { marginTop: 8, gap: 3 },
    totalRow: { flexDirection: t.row, justifyContent: "space-between" },
    grand: { flexDirection: t.row, justifyContent: "space-between", marginTop: 4, paddingTop: 6, borderTopWidth: 1, fontSize: 12, fontFamily: t.bold },
    notice: { marginTop: 10, padding: 8, borderRadius: 4, backgroundColor: "#fdecea", color: "#c0392b" },
    footer: { marginTop: 16, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: LINE, alignItems: "center", gap: 2, color: MUTED },
  });
}

type ReceiptPdfProps = {
  receipt: ReceiptView;
  labels: AppLabels;
  /** Langue de la famille (libellés fournis dans cette langue) ; français par défaut. */
  locale?: Locale;
};

/** Reçu A5 portrait, à la marque du centre (marque du client en marque blanche), dans la langue de la famille. */
export function ReceiptPdf({ receipt, labels, locale = "fr" }: ReceiptPdfProps) {
  const L = labels.receipts;
  const typeface = pdfTypeface(locale);
  const styles = createStyles(typeface);
  const rtl = typeface.rtl;
  const money = (amount: number) => pdfAmount(amount, locale);
  const cancellation = receipt.kind === "cancellation";
  const color = receipt.center.color ?? "#6c2bf5";
  const logo = pdfHeaderLogo(receipt.center.logoUrl, receipt.center.whiteLabel);
  const contact = [receipt.center.address, receipt.center.phone ? L.phone(formatPhone(receipt.center.phone)) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Document title={L.number(receipt.number)} language={locale} author={receipt.center.name} creator={receipt.center.name} producer={receipt.center.name}>
      <Page size="A5" style={styles.page}>
        <View style={[styles.header, { borderBottomColor: color }]}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- composant PDF, pas d'image HTML */}
          {logo ? <Image src={logo} style={styles.logo} /> : null}
          <View>
            <Text rtl={rtl} style={[styles.brandName, { color }]}>{receipt.center.name}</Text>
            {contact ? <ContactLine rtl={rtl} style={styles.muted} text={contact} /> : null}
          </View>
        </View>

        <View style={styles.titleRow}>
          <View>
            <Text rtl={rtl} style={styles.title}>{cancellation ? L.cancellationTitle : L.title}</Text>
            <Text rtl={rtl} style={styles.muted}>{L.issuedAt(formatDateTime(receipt.issuedAt))}</Text>
          </View>
          <Text rtl={rtl} style={styles.number}>{cancellation ? L.cancellationNumber(receipt.number) : L.number(receipt.number)}</Text>
        </View>

        <View style={styles.identity}>
          <View style={styles.field}>
            <Text rtl={rtl} style={styles.fieldLabel}>{L.student}</Text>
            <Text rtl={rtl} style={styles.fieldValue}>{receipt.studentName}</Text>
            {receipt.levelName ? <Text rtl={rtl} style={styles.muted}>{receipt.levelName}</Text> : null}
          </View>
          <View style={styles.field}>
            <Text rtl={rtl} style={styles.fieldLabel}>{L.period}</Text>
            <Text rtl={rtl} style={styles.fieldValue}>{receiptPeriodLabel(receipt.lines, locale)}</Text>
          </View>
        </View>

        {cancellation && receipt.cancelsNumber ? (
          <Text rtl={rtl} style={{ marginBottom: 6 }}>
            {L.cancels(receipt.cancelsNumber)}
            {receipt.cancelReason ? ` — ${labelled(L.cancelReason, receipt.cancelReason, locale)}` : ""}
          </Text>
        ) : null}

        <Text rtl={rtl} style={[styles.fieldLabel, { marginTop: 4 }]}>{L.lines}</Text>
        {receipt.lines.map((line) => (
          <View key={line.invoiceId} style={styles.line} wrap={false}>
            <View style={styles.lineTop}>
              <Text rtl={rtl} style={styles.bold}>{line.subject}</Text>
              <Text rtl={rtl} style={styles.bold}>{money(line.amountPaid)}</Text>
            </View>
            <Text rtl={rtl} style={styles.muted}>{L.linePeriod(formatDate(line.periodStart), formatDate(line.periodEnd))}</Text>
            {line.discountAmount > 0 ? (
              <View style={styles.lineTop}>
                <Text rtl={rtl} style={styles.muted}>
                  {L.rate} <Text rtl={rtl} style={styles.strike}>{money(line.amountFull)}</Text>
                  {line.discount ? ` · ${discountBadgeLabel(line.discount, labels, locale)}` : ""}
                </Text>
                <Text rtl={rtl}>{pdfAmount(-line.discountAmount, locale, true)}</Text>
              </View>
            ) : null}
          </View>
        ))}

        <View style={styles.totals}>
          {receipt.discountApplied !== 0 ? (
            <>
              <View style={styles.totalRow}>
                <Text rtl={rtl} style={styles.muted}>{L.totalFull}</Text>
                <Text rtl={rtl}>{money(receipt.amountFull)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text rtl={rtl} style={styles.muted}>{L.totalDiscount}</Text>
                <Text rtl={rtl}>{pdfAmount(-Math.abs(receipt.discountApplied), locale, true)}</Text>
              </View>
            </>
          ) : null}
          <View style={styles.grand}>
            <Text rtl={rtl}>{cancellation ? L.totalCancelled : L.total}</Text>
            <Text rtl={rtl} style={{ color }}>{money(receipt.amountPaid)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text rtl={rtl} style={styles.muted}>{L.method}</Text>
            <Text rtl={rtl}>{labels.paymentMethods[receipt.method]}</Text>
          </View>
          {!cancellation ? (
            <View style={styles.totalRow}>
              <Text rtl={rtl} style={styles.muted}>{L.balanceDue}</Text>
              <Text rtl={rtl}>{receipt.balanceDue > 0 ? money(receipt.balanceDue) : L.nothingDue}</Text>
            </View>
          ) : null}
          {receipt.issuedByName ? (
            <View style={styles.totalRow}>
              <Text rtl={rtl} style={styles.muted}>{cancellation ? L.cancelledBy : L.cashier}</Text>
              <Text rtl={rtl}>{receipt.issuedByName}</Text>
            </View>
          ) : null}
        </View>

        {receipt.cancelledBy ? (
          <Text rtl={rtl} style={styles.notice}>{L.cancelledNotice(receipt.cancelledBy.number, formatDate(receipt.cancelledBy.issuedAt))}</Text>
        ) : null}

        <View style={styles.footer}>
          <Text rtl={rtl} style={{ color: INK }}>{L.thanks}</Text>
          <Text rtl={rtl}>{receipt.center.name}</Text>
          {contact ? <ContactLine rtl={rtl} text={contact} /> : null}
          <PdfEditedWith whiteLabel={receipt.center.whiteLabel} label={L.editedWith} rtl={rtl} />
        </View>
      </Page>
    </Document>
  );
}
