import "server-only";

import { Document, Font, Image, Page, StyleSheet, View } from "@react-pdf/renderer";

import { amountInWords } from "@/lib/amount-words";
import type { AppLabels } from "@/lib/constants/labels";
import { formatDate, formatDateTime } from "@/lib/format";
import type { Locale } from "@/lib/i18n/locale";
import { PdfEditedWith, pdfHeaderLogo } from "@/lib/pdf/dirassty";
import { pdfAmount, type PdfTypeface, pdfTypeface } from "@/lib/pdf/fonts";
import { ContactLine, Text } from "@/lib/pdf/text";
import { formatPhone } from "@/lib/phone";
import { salaryPeriodLabel, type SalaryReceiptView } from "@/lib/salary-receipts";

// Pas de césure automatique (règles anglaises) : les mots français restent entiers.
Font.registerHyphenationCallback((word) => [word]);

const INK = "#3b3f5c";
const MUTED = "#8a90a6";
const LINE = "#e4e6ef";

/** Styles du reçu de paie : ceux du reçu des élèves (A5), rangées mirrorées en arabe. */
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
    identity: { flexDirection: t.row, gap: 16, marginBottom: 8 },
    field: { flex: 1 },
    fieldLabel: { fontSize: 7.5, color: MUTED, marginBottom: 2 },
    fieldValue: { fontSize: 10, fontFamily: t.bold },
    grand: { flexDirection: t.row, justifyContent: "space-between", marginTop: 6, paddingTop: 6, borderTopWidth: 1, fontSize: 12, fontFamily: t.bold },
    bold: { fontFamily: t.bold },
    words: { marginTop: 4, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: "#f5f6fa", borderRadius: 4 },
    row: { flexDirection: t.row, justifyContent: "space-between", marginTop: 3 },
    notice: { marginTop: 10, padding: 8, borderRadius: 4, backgroundColor: "#fdecea", color: "#c0392b" },
    signatures: { flexDirection: t.row, gap: 16, marginTop: 22 },
    signature: { flex: 1, borderTopWidth: 0.5, borderTopColor: MUTED, paddingTop: 4, color: MUTED, textAlign: "center" },
    footer: { marginTop: 16, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: LINE, alignItems: "center", gap: 2, color: MUTED },
  });
}

/** Reçu de paie A5, à la marque du centre, dans la langue de l'utilisateur. */
export function SalaryReceiptPdf({ receipt, labels, locale = "fr" }: { receipt: SalaryReceiptView; labels: AppLabels; locale?: Locale }) {
  const L = labels.salaryReceipts;
  const typeface = pdfTypeface(locale);
  const styles = createStyles(typeface);
  const rtl = typeface.rtl;
  const cancellation = receipt.kind === "cancellation";
  const color = receipt.center.color ?? "#6c2bf5";
  const logo = pdfHeaderLogo(receipt.center.logoUrl, receipt.center.whiteLabel);
  const contact = [receipt.center.address, receipt.center.phone ? labels.receipts.phone(formatPhone(receipt.center.phone)) : null]
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
            <Text rtl={rtl} style={styles.fieldLabel}>{L.member}</Text>
            <Text rtl={rtl} style={styles.fieldValue}>{receipt.memberName}</Text>
            <Text rtl={rtl} style={styles.muted}>{labels.roles[receipt.memberRole]}</Text>
          </View>
          <View style={styles.field}>
            <Text rtl={rtl} style={styles.fieldLabel}>{L.period}</Text>
            <Text rtl={rtl} style={styles.fieldValue}>{salaryPeriodLabel(receipt.period, locale)}</Text>
          </View>
        </View>

        {cancellation && receipt.cancelsNumber ? (
          <Text rtl={rtl} style={{ marginBottom: 6 }}>
            {L.cancels(receipt.cancelsNumber)}
            {receipt.cancelReason ? ` — ${L.cancelReason}${locale === "fr" ? " " : ""}: ${receipt.cancelReason}` : ""}
          </Text>
        ) : null}

        <View style={styles.grand}>
          <Text rtl={rtl}>{cancellation ? L.amountCancelled : L.amount}</Text>
          <Text rtl={rtl} style={{ color }}>{pdfAmount(receipt.amount, locale)}</Text>
        </View>
        <View style={styles.words}>
          <Text rtl={rtl} style={styles.fieldLabel}>{L.amountInWords}</Text>
          <Text rtl={rtl} style={styles.bold}>{amountInWords(receipt.amount, locale)}</Text>
        </View>

        <View style={styles.row}>
          <Text rtl={rtl} style={styles.muted}>{L.paidOn}</Text>
          <Text rtl={rtl}>{formatDate(receipt.paidOn)}</Text>
        </View>
        <View style={styles.row}>
          <Text rtl={rtl} style={styles.muted}>{L.method}</Text>
          <Text rtl={rtl}>{labels.paymentMethods[receipt.method]}</Text>
        </View>
        {receipt.note ? (
          <View style={styles.row}>
            <Text rtl={rtl} style={styles.muted}>{L.note}</Text>
            <Text rtl={rtl}>{receipt.note}</Text>
          </View>
        ) : null}
        {receipt.issuedByName ? (
          <View style={styles.row}>
            <Text rtl={rtl} style={styles.muted}>{cancellation ? L.cancelledBy : L.issuedBy}</Text>
            <Text rtl={rtl}>{receipt.issuedByName}</Text>
          </View>
        ) : null}

        {receipt.cancelledBy ? (
          <Text rtl={rtl} style={styles.notice}>{L.cancelledNotice(receipt.cancelledBy.number, formatDate(receipt.cancelledBy.issuedAt))}</Text>
        ) : null}

        {!cancellation ? (
          <View style={styles.signatures}>
            <Text rtl={rtl} style={styles.signature}>{L.signatureMember}</Text>
            <Text rtl={rtl} style={styles.signature}>{L.signatureCenter}</Text>
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text rtl={rtl}>{receipt.center.name}</Text>
          {contact ? <ContactLine rtl={rtl} text={contact} /> : null}
          <PdfEditedWith whiteLabel={receipt.center.whiteLabel} label={labels.receipts.editedWith} rtl={rtl} />
        </View>
      </Page>
    </Document>
  );
}
