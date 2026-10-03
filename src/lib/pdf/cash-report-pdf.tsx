import "server-only";

import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import type { CashSessionSummary } from "@/lib/cash";
import type { AppLabels } from "@/lib/constants/labels";
import { formatDate, formatDateTime, formatMAD, formatTime } from "@/lib/format";
import type { CenterPdfBrand } from "@/lib/pdf/center-brand";
import { PAYMENT_METHODS } from "@/lib/receipts";

Font.registerHyphenationCallback((word) => [word]);

/** Montant lisible par les polices PDF standard (pas de signe moins typographique). */
function money(amount: number): string {
  return formatMAD(amount).replace(/−/g, "-");
}

const INK = "#3b3f5c";
const MUTED = "#8a90a6";
const LINE = "#e4e6ef";
const DANGER = "#c0262d";
const SUCCESS = "#137a4f";

const styles = StyleSheet.create({
  page: { padding: 36, paddingBottom: 48, fontSize: 9, fontFamily: "Helvetica", color: INK },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 10, borderBottomWidth: 2, marginBottom: 14 },
  logo: { width: 36, height: 36, objectFit: "contain" },
  brand: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  muted: { color: MUTED },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 10 },
  session: { marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: LINE },
  sessionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  methods: { flexDirection: "row", gap: 8, marginVertical: 8 },
  method: { flex: 1, borderWidth: 0.5, borderColor: LINE, borderRadius: 3, padding: 5 },
  methodLabel: { fontSize: 7.5, color: MUTED },
  methodValue: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  subTitle: { fontSize: 9.5, fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 3 },
  headRow: { flexDirection: "row", borderBottomWidth: 1, paddingBottom: 3, marginBottom: 1, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 3 },
  right: { textAlign: "right" },
  closing: { marginTop: 8, alignSelf: "flex-end", width: 240, gap: 3 },
  line: { flexDirection: "row", justifyContent: "space-between" },
  strong: { fontFamily: "Helvetica-Bold" },
  dayTotal: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, paddingTop: 6, fontSize: 12, fontFamily: "Helvetica-Bold" },
  signature: { marginTop: 36, alignSelf: "flex-end", width: 200, borderTopWidth: 0.5, paddingTop: 4, color: MUTED, textAlign: "center" },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: MUTED },
});

function Header({ brand }: { brand: CenterPdfBrand }) {
  const logo = brand.logoUrl && /\.(png|jpe?g)(\?|$)/i.test(brand.logoUrl) ? brand.logoUrl : null;
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

function varianceLabel(variance: number, labels: AppLabels): string {
  const C = labels.cash;
  return variance === 0 ? C.variance.none : variance < 0 ? C.variance.shortage(money(-variance)) : C.variance.surplus(money(variance));
}

function SessionBlock({ session, labels }: { session: CashSessionSummary; labels: AppLabels }) {
  const C = labels.cash;
  const P = C.admin.pdf;
  const cols = [0.8, 3, 1.6, 1.4, 1.4];
  const holder = session.isShared ? C.shared : C.personal(session.holderName);
  return (
    <View style={styles.session}>
      <Text style={styles.sessionTitle}>{P.session(holder, C.status[session.status])}</Text>
      <Text style={styles.muted}>
        {P.opened(formatTime(session.openedAt), session.openedByName)}
        {" · "}
        {session.closedAt ? P.closed(formatTime(session.closedAt), session.closedByName) : P.notClosed}
      </Text>

      <View style={styles.methods}>
        {PAYMENT_METHODS.map((method) => (
          <View key={method} style={styles.method}>
            <Text style={styles.methodLabel}>{C.methods[method]}</Text>
            <Text style={styles.methodValue}>{money(session.byMethod[method])}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.subTitle}>
        {P.receipts} ({C.transactions(session.transactions)})
      </Text>
      {session.receipts.length === 0 ? (
        <Text style={styles.muted}>{P.noReceipts}</Text>
      ) : (
        <View>
          <View style={styles.headRow}>
            <Text style={{ flex: cols[0] }}>{P.time}</Text>
            <Text style={{ flex: cols[1] }}>{P.student}</Text>
            <Text style={{ flex: cols[2] }}>{P.receipt}</Text>
            <Text style={{ flex: cols[3] }}>{P.method}</Text>
            <Text style={[{ flex: cols[4] }, styles.right]}>{P.amount}</Text>
          </View>
          {session.receipts.map((receipt) => (
            <View key={receipt.id} style={styles.row} wrap={false}>
              <Text style={{ flex: cols[0] }}>{formatTime(receipt.issuedAt)}</Text>
              <Text style={{ flex: cols[1] }}>
                {receipt.kind === "cancellation" ? `${C.cancellation} · ` : ""}
                {receipt.studentName}
              </Text>
              <Text style={{ flex: cols[2] }}>{receipt.number}</Text>
              <Text style={{ flex: cols[3] }}>{receipt.method ? C.methods[receipt.method] : "-"}</Text>
              <Text style={[{ flex: cols[4] }, styles.right, receipt.amount < 0 ? { color: DANGER } : {}]}>{money(receipt.amount)}</Text>
            </View>
          ))}
        </View>
      )}

      {session.movements.length > 0 ? (
        <View>
          <Text style={styles.subTitle}>{P.movements}</Text>
          {session.movements.map((movement) => (
            <View key={movement.id} style={styles.row} wrap={false}>
              <Text style={{ flex: cols[0] }}>{formatTime(movement.createdAt)}</Text>
              <Text style={{ flex: cols[1] + cols[2] }}>
                {C.movementKinds[movement.kind]}
                {movement.reason ? ` · ${movement.reason}` : ""}
              </Text>
              <Text style={{ flex: cols[3] }}>{movement.createdByName ?? ""}</Text>
              <Text style={[{ flex: cols[4] }, styles.right]}>{money(movement.amount)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.closing} wrap={false}>
        <View style={styles.line}>
          <Text>{P.float}</Text>
          <Text>{money(session.openingFloat)}</Text>
        </View>
        <View style={styles.line}>
          <Text style={styles.strong}>{P.expectedCash}</Text>
          <Text style={styles.strong}>{money(session.expectedCash)}</Text>
        </View>
        {session.countedCash !== null ? (
          <>
            <View style={styles.line}>
              <Text>{P.counted}</Text>
              <Text>{money(session.countedCash)}</Text>
            </View>
            <View style={styles.line}>
              <Text style={styles.strong}>{P.variance}</Text>
              <Text style={[styles.strong, { color: (session.variance ?? 0) === 0 ? SUCCESS : DANGER }]}>
                {varianceLabel(session.variance ?? 0, labels)}
              </Text>
            </View>
            {session.varianceReason ? (
              <Text style={styles.muted}>
                {P.reason} : {session.varianceReason}
              </Text>
            ) : null}
          </>
        ) : null}
      </View>
    </View>
  );
}

/** Rapport de caisse d'une journée : chaque session, ses encaissements, ses mouvements, son comptage. */
export function CashReportPdf({
  brand,
  labels,
  date,
  sessions,
  generatedAt,
}: {
  brand: CenterPdfBrand;
  labels: AppLabels;
  date: string;
  sessions: CashSessionSummary[];
  generatedAt: Date;
}) {
  const P = labels.cash.admin.pdf;
  const title = P.title(formatDate(date));
  const dayTotal = sessions.reduce((sum, session) => sum + PAYMENT_METHODS.reduce((total, method) => total + session.byMethod[method], 0), 0);
  return (
    <Document title={title} author={brand.name} creator={brand.name} producer={brand.name}>
      <Page size="A4" style={styles.page}>
        <Header brand={brand} />
        <Text style={styles.title}>{title}</Text>
        {sessions.length === 0 ? <Text style={styles.muted}>{P.empty}</Text> : null}
        {sessions.map((session) => (
          <SessionBlock key={session.id} session={session} labels={labels} />
        ))}
        <View style={styles.dayTotal} wrap={false}>
          <Text>{P.dayTotal}</Text>
          <Text>{money(dayTotal)}</Text>
        </View>
        <Text style={styles.signature}>{P.signature}</Text>
        <View style={styles.footer} fixed>
          <Text>{brand.name}</Text>
          <Text>{P.generatedAt(formatDateTime(generatedAt))}</Text>
        </View>
      </Page>
    </Document>
  );
}
