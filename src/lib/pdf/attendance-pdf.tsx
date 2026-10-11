import "server-only";

import { Document, Font, Image, Page, StyleSheet, View } from "@react-pdf/renderer";

import type { AttendanceSummary } from "@/lib/attendance";
import type { AppLabels } from "@/lib/constants/labels";
import type { AbsenceFollowUp, AttendanceStudent } from "@/lib/data/attendance";
import { formatDate, formatDateTime, formatDateWithWeekday, formatPercent } from "@/lib/format";
import type { Locale } from "@/lib/i18n/locale";
import { PdfEditedWith, pdfHeaderLogo } from "@/lib/pdf/dirassty";
import { pdfText, type PdfTypeface, pdfTypeface } from "@/lib/pdf/fonts";
import { Text } from "@/lib/pdf/text";

type AttendancePdfProps = {
  /** Libellés dans la langue de la famille. */
  labels: AppLabels;
  /** Langue de la famille ; français par défaut. */
  locale?: Locale;
  brandName: string;
  /** Logo PNG ou JPEG (les autres formats ne sont pas lus par le moteur PDF). */
  logoUrl: string | null;
  /** Centre en marque blanche : ni symbole ni mention dirassty. */
  whiteLabel: boolean;
  color: string;
  student: AttendanceStudent;
  periodLabel: string;
  subjectLabel: string;
  summary: AttendanceSummary;
  followUps: AbsenceFollowUp[];
  generatedAt: Date;
};

// Pas de césure automatique (règles anglaises) : les mots français restent entiers.
Font.registerHyphenationCallback((word) => [word]);

/** Styles de la fiche : polices de la langue ; rangées, colonnes et marges mirrorées en arabe. */
function createStyles(t: PdfTypeface) {
  return StyleSheet.create({
    page: { paddingTop: 36, paddingBottom: 48, paddingHorizontal: 36, fontSize: 9, fontFamily: t.regular, color: "#3b3f5c", ...(t.rtl ? { textAlign: "right" as const } : {}) },
    header: { flexDirection: t.row, justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
    brand: { flexDirection: t.row, alignItems: "center", gap: 8 },
    logo: { width: 32, height: 32, objectFit: "contain" },
    brandName: { fontSize: 13, fontFamily: t.bold },
    title: { fontSize: 16, fontFamily: t.bold, marginBottom: 4 },
    muted: { color: "#8a90a6" },
    identity: { flexDirection: t.row, flexWrap: "wrap", gap: 16, marginBottom: 14 },
    field: { minWidth: 110 },
    fieldLabel: { fontSize: 7.5, color: "#8a90a6", marginBottom: 2 },
    fieldValue: { fontSize: 10, fontFamily: t.bold },
    stats: { flexDirection: t.row, gap: 10, marginBottom: 14 },
    stat: { flex: 1, borderRadius: 6, padding: 10, backgroundColor: "#f5f6fa" },
    statValue: { fontSize: 16, fontFamily: t.bold },
    section: { marginBottom: 14 },
    sectionTitle: { fontSize: 11, fontFamily: t.bold, marginBottom: 6 },
    row: { flexDirection: t.row, borderBottomWidth: 0.5, borderBottomColor: "#e4e6ef", paddingVertical: 4 },
    headRow: { flexDirection: t.row, borderBottomWidth: 1, paddingBottom: 4, marginBottom: 2 },
    cell: t.rtl ? { paddingLeft: 6 } : { paddingRight: 6 },
    alert: { color: "#c0392b", fontFamily: t.bold },
    footer: { position: "absolute", bottom: 24, left: 36, right: 36, flexDirection: t.row, justifyContent: "space-between", fontSize: 7.5, color: "#8a90a6" },
  });
}

type Styles = ReturnType<typeof createStyles>;

function Field({ label, value, styles, rtl }: { label: string; value: string; styles: Styles; rtl: boolean }) {
  return (
    <View style={styles.field}>
      <Text rtl={rtl} style={styles.fieldLabel}>{label}</Text>
      <Text rtl={rtl} style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

/** Fiche d'assiduité imprimable, à la marque du centre, dans la langue de la famille. */
export function AttendancePdf({
  labels,
  locale = "fr",
  brandName,
  logoUrl,
  whiteLabel,
  color,
  student,
  periodLabel,
  subjectLabel,
  summary,
  followUps,
  generatedAt,
}: AttendancePdfProps) {
  const L = labels.attendanceSheet;
  const typeface = pdfTypeface(locale);
  const styles = createStyles(typeface);
  const rtl = typeface.rtl;
  const percent = (ratio: number) => pdfText(formatPercent(ratio, locale));
  const logo = pdfHeaderLogo(logoUrl, whiteLabel);
  const rate = summary.rate === null ? L.noRate : percent(summary.rate);

  return (
    <Document title={`${L.pdfTitle} — ${student.fullName}`} language={locale} author={brandName} creator={brandName} producer={brandName}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <View style={styles.brand}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- composant PDF, pas d'image HTML */}
            {logo ? <Image src={logo} style={styles.logo} /> : null}
            <Text rtl={rtl} style={[styles.brandName, { color }]}>{brandName}</Text>
          </View>
          <Text rtl={rtl} style={styles.muted}>{L.pdfGeneratedOn(formatDateTime(generatedAt))}</Text>
        </View>

        <Text rtl={rtl} style={[styles.title, { color }]}>{L.pdfTitle}</Text>
        <View style={styles.identity}>
          <Field styles={styles} rtl={rtl} label={L.pdfStudent} value={student.fullName} />
          <Field styles={styles} rtl={rtl} label={L.pdfLevel} value={student.levelName || "—"} />
          <Field styles={styles} rtl={rtl} label={L.pdfGuardian} value={student.guardianName || "—"} />
          <Field styles={styles} rtl={rtl} label={L.pdfPeriod} value={periodLabel} />
          <Field styles={styles} rtl={rtl} label={L.subject} value={subjectLabel} />
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text rtl={rtl} style={[styles.statValue, { color }]}>{summary.absences}</Text>
            <Text rtl={rtl} style={styles.muted}>{L.totalAbsences}</Text>
          </View>
          <View style={styles.stat}>
            <Text rtl={rtl} style={[styles.statValue, { color }]}>{rate}</Text>
            <Text rtl={rtl} style={styles.muted}>{L.rate}</Text>
          </View>
          <View style={styles.stat}>
            <Text rtl={rtl} style={[styles.statValue, { color }]}>{summary.sessions}</Text>
            <Text rtl={rtl} style={styles.muted}>{L.sessions}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text rtl={rtl} style={styles.sectionTitle}>{L.bySubject}</Text>
          <View style={[styles.headRow, { borderBottomColor: color }]}>
            <Text rtl={rtl} style={[styles.cell, { width: "50%" }]}>{L.subject}</Text>
            <Text rtl={rtl} style={[styles.cell, { width: "20%" }]}>{L.totalAbsences}</Text>
            <Text rtl={rtl} style={[styles.cell, { width: "15%" }]}>{L.sessions}</Text>
            <Text rtl={rtl} style={[styles.cell, { width: "15%" }]}>{L.rate}</Text>
          </View>
          {summary.bySubject.map((subject) => (
            <View key={subject.subjectId} style={styles.row} wrap={false}>
              <Text rtl={rtl} style={[styles.cell, { width: "50%" }]}>{subject.subjectName}</Text>
              <Text rtl={rtl} style={[styles.cell, { width: "20%" }]}>{subject.absences}</Text>
              <Text rtl={rtl} style={[styles.cell, { width: "15%" }]}>{subject.sessions}</Text>
              <Text rtl={rtl} style={[styles.cell, { width: "15%" }]}>{subject.rate === null ? L.noRate : percent(subject.rate)}</Text>
            </View>
          ))}
        </View>

        {summary.streaks.length > 0 ? (
          <View style={styles.section}>
            <Text rtl={rtl} style={styles.sectionTitle}>{L.streaksTitle}</Text>
            {summary.streaks.map((streak) => (
              <Text rtl={rtl} key={`${streak.subjectName}-${streak.from}`} style={streak.alert ? styles.alert : undefined}>
                {L.streak(streak.length, streak.subjectName)} ({L.streakRange(formatDate(streak.from), formatDate(streak.to))})
                {streak.alert ? ` — ${L.alertTriggered}` : ""}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text rtl={rtl} style={styles.sectionTitle}>
            {L.listTitle} ({summary.absences})
          </Text>
          {summary.absencesList.length === 0 ? (
            <Text rtl={rtl} style={styles.muted}>{L.emptyDescription}</Text>
          ) : (
            <>
              <View style={[styles.headRow, { borderBottomColor: color }]} fixed>
                <Text rtl={rtl} style={[styles.cell, { width: "22%" }]}>{L.date}</Text>
                <Text rtl={rtl} style={[styles.cell, { width: "12%" }]}>{L.time}</Text>
                <Text rtl={rtl} style={[styles.cell, { width: "20%" }]}>{L.subject}</Text>
                <Text rtl={rtl} style={[styles.cell, { width: "18%" }]}>{L.teacher}</Text>
                <Text rtl={rtl} style={[styles.cell, { width: "28%" }]}>{L.note}</Text>
              </View>
              {summary.absencesList.map((absence) => (
                <View key={absence.id} style={styles.row} wrap={false}>
                  <Text rtl={rtl} style={[styles.cell, { width: "22%" }, absence.triggersAlert ? styles.alert : {}]}>
                    {formatDateWithWeekday(absence.date, locale)}
                    {absence.triggersAlert ? `\n${L.alertTriggered}` : ""}
                  </Text>
                  <Text rtl={rtl} style={[styles.cell, { width: "12%" }]}>
                    {absence.startTime && absence.endTime ? `${absence.startTime}–${absence.endTime}` : "—"}
                  </Text>
                  <Text rtl={rtl} style={[styles.cell, { width: "20%" }]}>{absence.subjectName}</Text>
                  <Text rtl={rtl} style={[styles.cell, { width: "18%" }]}>{absence.teacherName ?? "—"}</Text>
                  <Text rtl={rtl} style={[styles.cell, { width: "28%" }]}>{absence.note ?? "—"}</Text>
                </View>
              ))}
            </>
          )}
        </View>

        {followUps.length > 0 ? (
          <View style={styles.section}>
            <Text rtl={rtl} style={styles.sectionTitle}>{L.followUpsTitle}</Text>
            {followUps.map((followUp) => (
              <Text rtl={rtl} key={followUp.id} style={{ marginBottom: 3 }}>
                {formatDateTime(followUp.createdAt)} · {labels.followUp.channels[followUp.channel]}
                {followUp.note ? ` — ${followUp.note}` : ""}
                {followUp.authorName ? ` (${L.followUpBy(followUp.authorName)})` : ""}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text rtl={rtl}>
            {brandName} · {student.fullName}
          </Text>
          <PdfEditedWith whiteLabel={whiteLabel} label={labels.receipts.editedWith} rtl={rtl} />
          <Text rtl={rtl} render={({ pageNumber, totalPages }) => L.pdfPage(pageNumber, totalPages)} />
        </View>
      </Page>
    </Document>
  );
}
