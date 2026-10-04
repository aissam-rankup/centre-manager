import { toISODate, today } from "@/lib/format";

/** Seuil d'alerte : absences consécutives dans une même matière. */
export const ABSENCE_ALERT_THRESHOLD = 3;

export type AttendancePeriod = "month" | "quarter" | "all";
export const ATTENDANCE_PERIODS: readonly AttendancePeriod[] = ["month", "quarter", "all"];

/** À quel titre une présence a été saisie. */
export type AttendanceMarker = "teacher" | "assistant" | "admin";

/** Une saisie de l'historique d'une présence. */
export type AttendanceMark = {
  status: "present" | "absent";
  role: AttendanceMarker | null;
  by: string | null;
  /** ISO 8601. */
  at: string;
};

export type AttendanceRecord = {
  id: string;
  date: string;
  status: "present" | "absent";
  subjectId: string;
  subjectName: string;
  levelName: string;
  teacherName: string | null;
  startTime: string | null;
  endTime: string | null;
  note: string | null;
  /** Qui a saisi le statut affiché, à quel titre, quand. */
  markedByName: string | null;
  markedByRole: AttendanceMarker | null;
  markedAt: string;
  /** Saisies successives (vide s'il n'y en a eu qu'une). */
  history: AttendanceMark[];
};

export type AbsenceEntry = AttendanceRecord & {
  /** Rang dans la série d'absences consécutives de la matière (1, 2, 3…). */
  streakPosition: number;
  /** Longueur totale de la série à laquelle appartient l'absence. */
  streakLength: number;
  /** Absence qui a déclenché l'alerte (3ᵉ consécutive). */
  triggersAlert: boolean;
};

export type SubjectStats = { subjectId: string; subjectName: string; absences: number; sessions: number; rate: number | null };

export type AbsenceStreak = { subjectName: string; from: string; to: string; length: number; alert: boolean; ongoing: boolean };

export type AttendanceSummary = {
  sessions: number;
  absences: number;
  /** Taux de présence (0 à 1) ; nul sans séance. */
  rate: number | null;
  bySubject: SubjectStats[];
  absencesList: AbsenceEntry[];
  streaks: AbsenceStreak[];
};

/** Premier jour de la période (ISO) ; nul pour tout l'historique. */
export function periodStart(period: AttendancePeriod, reference = today()): string | null {
  if (period === "all") return null;
  const date = new Date(Date.UTC(reference.getFullYear(), reference.getMonth(), 1));
  if (period === "quarter") date.setUTCMonth(Math.floor(reference.getMonth() / 3) * 3);
  return toISODate(date);
}

/**
 * Séries d'absences : calculées sur tout l'historique de chaque matière
 * (une série commencée avant la période reste une série), puis filtrées.
 */
export function summarizeAttendance(
  records: AttendanceRecord[],
  { from, subjectId }: { from: string | null; subjectId: string | null },
): AttendanceSummary {
  const streakInfo = new Map<string, { position: number; length: number }>();
  const streaks: AbsenceStreak[] = [];
  const bySubjectAll = new Map<string, AttendanceRecord[]>();
  for (const record of records) {
    const list = bySubjectAll.get(record.subjectId) ?? [];
    list.push(record);
    bySubjectAll.set(record.subjectId, list);
  }
  for (const list of bySubjectAll.values()) {
    const chronological = [...list].sort((a, b) => a.date.localeCompare(b.date));
    let current: AttendanceRecord[] = [];
    const close = (ongoing: boolean) => {
      current.forEach((record, index) => streakInfo.set(record.id, { position: index + 1, length: current.length }));
      if (current.length >= 2) {
        const first = current[0];
        const last = current[current.length - 1];
        if (first && last) {
          streaks.push({
            subjectName: first.subjectName,
            from: first.date,
            to: last.date,
            length: current.length,
            alert: current.length >= ABSENCE_ALERT_THRESHOLD,
            ongoing,
          });
        }
      }
      current = [];
    };
    for (const record of chronological) {
      if (record.status === "absent") current.push(record);
      else close(false);
    }
    close(true);
  }

  const visible = records.filter((r) => (!from || r.date >= from) && (!subjectId || r.subjectId === subjectId));
  const absencesList: AbsenceEntry[] = visible
    .filter((r) => r.status === "absent")
    .sort((a, b) => b.date.localeCompare(a.date) || (b.startTime ?? "").localeCompare(a.startTime ?? ""))
    .map((r) => {
      const info = streakInfo.get(r.id) ?? { position: 1, length: 1 };
      return {
        ...r,
        streakPosition: info.position,
        streakLength: info.length,
        triggersAlert: info.position === ABSENCE_ALERT_THRESHOLD,
      };
    });

  const subjects = new Map<string, SubjectStats>();
  for (const r of visible) {
    const stats = subjects.get(r.subjectId) ?? { subjectId: r.subjectId, subjectName: r.subjectName, absences: 0, sessions: 0, rate: null };
    stats.sessions += 1;
    if (r.status === "absent") stats.absences += 1;
    subjects.set(r.subjectId, stats);
  }
  const bySubject = [...subjects.values()]
    .map((s) => ({ ...s, rate: s.sessions ? (s.sessions - s.absences) / s.sessions : null }))
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName, "fr"));

  const sessions = visible.length;
  const absences = absencesList.length;
  return {
    sessions,
    absences,
    rate: sessions ? (sessions - absences) / sessions : null,
    bySubject,
    absencesList,
    streaks: streaks
      .filter((s) => (!from || s.to >= from) && (!subjectId || bySubjectAll.get(subjectId)?.some((r) => r.subjectName === s.subjectName)))
      .sort((a, b) => b.to.localeCompare(a.to)),
  };
}

/** Paramètres d'URL de la fiche : ?periode=mois|trimestre|tout&matiere=<id>. */
const PERIOD_PARAM: Record<string, AttendancePeriod> = { mois: "month", trimestre: "quarter", tout: "all" };
export const PERIOD_TO_PARAM: Record<AttendancePeriod, string> = { month: "mois", quarter: "trimestre", all: "tout" };

export type AttendanceFilters = { period: AttendancePeriod; subjectId: string | null };

export function parseAttendanceFilters(params: Record<string, string | string[] | undefined>): AttendanceFilters {
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const period = PERIOD_PARAM[one(params.periode) ?? ""] ?? "all";
  const subject = one(params.matiere);
  return { period, subjectId: subject && /^[0-9a-f-]{36}$/.test(subject) ? subject : null };
}

export function attendanceQuery(filters: AttendanceFilters, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(extra);
  params.set("periode", PERIOD_TO_PARAM[filters.period]);
  if (filters.subjectId) params.set("matiere", filters.subjectId);
  return params.toString();
}
