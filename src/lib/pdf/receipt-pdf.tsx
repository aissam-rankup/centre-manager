import "server-only";

import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import type { AppLabels } from "@/lib/constants/labels";
import { discountBadgeLabel } from "@/lib/discounts";
import { formatDate, formatDateTime, formatMAD } from "@/lib/format";
import { PdfEditedWith, pdfHeaderLogo } from "@/lib/pdf/dirassty";
import { formatPhone } from "@/lib/phone";
import { receiptPeriodLabel, type ReceiptView } from "@/lib/receipts";

// Pas de césure automatique (règles anglaises) : les mots français restent entiers.
Font.registerHyphenationCallback((word) => [word]);

/** Montant lisible par les polices PDF standard (pas de signe moins typographique). */
function money(amount: number): string {
  return formatMAD(amount).replace(/−/g, "-");
}

const INK = "#3b3f5c";
const MUTED = "#8a90a6";
const LINE = "#e4e6ef";

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: "Helvetica", color: INK },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 10, borderBottomWidth: 2, marginBottom: 12 },
  logo: { width: 36, height: 36, objectFit: "contain" },
  brandName: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  muted: { color: MUTED },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  number: { fontSize: 11, fontFamily: "Helvetica-Bold", textAlign: "right" },
  identity: { flexDirection: "row", gap: 16, marginBottom: 10 },
  field: { flex: 1 },
  fieldLabel: { fontSize: 7.5, color: MUTED, marginBottom: 2 },
  fieldValue: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  line: { borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 5 },
  lineTop: { flexDirection: "row", justifyContent: "space-between" },
  bold: { fontFamily: "Helvetica-Bold" },
  strike: { color: MUTED, textDecoration: "line-through" },
  totals: { marginTop: 8, gap: 3 },
  totalRow: { flexDirection: "row", justifyContent: "space-between" },
  grand: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, paddingTop: 6, borderTopWidth: 1, fontSize: 12, fontFamily: "Helvetica-Bold" },
  notice: { marginTop: 10, padding: 8, borderRadius: 4, backgroundColor: "#fdecea", color: "#c0392b" },
  footer: { marginTop: 16, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: LINE, alignItems: "center", gap: 2, color: MUTED },
});

type ReceiptPdfProps = { receipt: ReceiptView; labels: AppLabels };

/** Reçu A5 portrait, à la marque du centre (marque du client en marque blanche). */
export function ReceiptPdf({ receipt, labels }: ReceiptPdfProps) {
  const L = labels.receipts;
  const cancellation = receipt.kind === "cancellation";
  const color = receipt.center.color ?? "#6c2bf5";
  const logo = pdfHeaderLogo(receipt.center.logoUrl, receipt.center.whiteLabel);
  const contact = [receipt.center.address, receipt.center.phone ? L.phone(formatPhone(receipt.center.phone)) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Document title={L.number(receipt.number)} author={receipt.center.name} creator={receipt.center.name} producer={receipt.center.name}>
      <Page size="A5" style={styles.page}>
        <View style={[styles.header, { borderBottomColor: color }]}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- composant PDF, pas d'image HTML */}
          {logo ? <Image src={logo} style={styles.logo} /> : null}
          <View>
            <Text style={[styles.brandName, { color }]}>{receipt.center.name}</Text>
            {contact ? <Text style={styles.muted}>{contact}</Text> : null}
          </View>
        </View>

        <View style={styles.titleRow}>
          <View>
            <Text style={styles.title}>{cancellation ? L.cancellationTitle : L.title}</Text>
            <Text style={styles.muted}>{L.issuedAt(formatDateTime(receipt.issuedAt))}</Text>
          </View>
          <Text style={styles.number}>{cancellation ? L.cancellationNumber(receipt.number) : L.number(receipt.number)}</Text>
        </View>

        <View style={styles.identity}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{L.student}</Text>
            <Text style={styles.fieldValue}>{receipt.studentName}</Text>
            {receipt.levelName ? <Text style={styles.muted}>{receipt.levelName}</Text> : null}
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{L.period}</Text>
            <Text style={styles.fieldValue}>{receiptPeriodLabel(receipt.lines)}</Text>
          </View>
        </View>

        {cancellation && receipt.cancelsNumber ? (
          <Text style={{ marginBottom: 6 }}>
            {L.cancels(receipt.cancelsNumber)}
            {receipt.cancelReason ? ` — ${L.cancelReason} : ${receipt.cancelReason}` : ""}
          </Text>
        ) : null}

        <Text style={[styles.fieldLabel, { marginTop: 4 }]}>{L.lines}</Text>
        {receipt.lines.map((line) => (
          <View key={line.invoiceId} style={styles.line} wrap={false}>
            <View style={styles.lineTop}>
              <Text style={styles.bold}>{line.subject}</Text>
              <Text style={styles.bold}>{money(line.amountPaid)}</Text>
            </View>
            <Text style={styles.muted}>{L.linePeriod(formatDate(line.periodStart), formatDate(line.periodEnd))}</Text>
            {line.discountAmount > 0 ? (
              <View style={styles.lineTop}>
                <Text style={styles.muted}>
                  {L.rate} <Text style={styles.strike}>{money(line.amountFull)}</Text>
                  {line.discount ? ` · ${discountBadgeLabel(line.discount, labels)}` : ""}
                </Text>
                <Text>- {money(line.discountAmount)}</Text>
              </View>
            ) : null}
          </View>
        ))}

        <View style={styles.totals}>
          {receipt.discountApplied !== 0 ? (
            <>
              <View style={styles.totalRow}>
                <Text style={styles.muted}>{L.totalFull}</Text>
                <Text>{money(receipt.amountFull)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.muted}>{L.totalDiscount}</Text>
                <Text>- {money(Math.abs(receipt.discountApplied))}</Text>
              </View>
            </>
          ) : null}
          <View style={styles.grand}>
            <Text>{cancellation ? L.totalCancelled : L.total}</Text>
            <Text style={{ color }}>{money(receipt.amountPaid)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.muted}>{L.method}</Text>
            <Text>{labels.paymentMethods[receipt.method]}</Text>
          </View>
          {!cancellation ? (
            <View style={styles.totalRow}>
              <Text style={styles.muted}>{L.balanceDue}</Text>
              <Text>{receipt.balanceDue > 0 ? money(receipt.balanceDue) : L.nothingDue}</Text>
            </View>
          ) : null}
          {receipt.issuedByName ? (
            <View style={styles.totalRow}>
              <Text style={styles.muted}>{cancellation ? L.cancelledBy : L.cashier}</Text>
              <Text>{receipt.issuedByName}</Text>
            </View>
          ) : null}
        </View>

        {receipt.cancelledBy ? (
          <Text style={styles.notice}>{L.cancelledNotice(receipt.cancelledBy.number, formatDate(receipt.cancelledBy.issuedAt))}</Text>
        ) : null}

        <View style={styles.footer}>
          <Text style={{ color: INK }}>{L.thanks}</Text>
          <Text>{receipt.center.name}</Text>
          {contact ? <Text>{contact}</Text> : null}
          <PdfEditedWith whiteLabel={receipt.center.whiteLabel} />
        </View>
      </Page>
    </Document>
  );
}
