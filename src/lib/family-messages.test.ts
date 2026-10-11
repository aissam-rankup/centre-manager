import { describe, expect, it } from "vitest";

import { renderAbsenceMessage } from "@/lib/absences";
import { familyLabelsFor, labelsFor } from "@/lib/constants/labels";
import { renderReceiptMessage } from "@/lib/receipts";
import { renderReminderMessage } from "@/lib/reminders";
import { DEFAULT_VOCABULARY } from "@/lib/vocabulary";

const absence = { student: "Salma", date: "14/10/2026", day: "mardi", subject: "Maths", time: "17:00", teacher: "M. Alami", center: "Centre Atlas" };
const reminder = { student: "Salma", month: "novembre", subjects: "Maths", amount: "550 MAD", date: "5 novembre", days: "3 jours", center: "Centre Atlas" };
const receipt = { student: "Salma", period: "Octobre 2026", amount: "450 MAD", center: "Centre Atlas", link: "https://x.test/r", number: "2026-0042" };
const CUSTOM = "Message du centre : [élève] — [centre]";

describe("messages aux familles", () => {
  it("sont rédigés dans la langue de la famille, variables remplacées", () => {
    for (const locale of ["fr", "en", "ar"] as const) {
      const labels = familyLabelsFor(DEFAULT_VOCABULARY, null, locale);
      for (const message of [
        renderAbsenceMessage(null, absence, labels, false, locale),
        renderAbsenceMessage(null, absence, labels, true, locale),
        renderReminderMessage(null, "overdue", reminder, labels, locale),
        renderReceiptMessage(null, receipt, labels, locale),
      ]) {
        expect(message).toContain("Salma");
        expect(message).toContain("Centre Atlas");
        expect(message).not.toMatch(/\[[^\]]+\]/);
      }
    }
    const arabic = renderReceiptMessage(null, receipt, familyLabelsFor(DEFAULT_VOCABULARY, null, "ar"), "ar");
    expect(arabic).toMatch(/[؀-ۿ]/);
    expect(renderReceiptMessage(null, receipt, familyLabelsFor(DEFAULT_VOCABULARY, null, "en"), "en")).not.toBe(
      renderReceiptMessage(null, receipt, labelsFor(), "fr"),
    );
  });

  it("utilisent le modèle du centre de la langue de la famille, variables de cette langue", () => {
    expect(renderAbsenceMessage(CUSTOM, absence, labelsFor(), false, "fr")).toBe("Message du centre : Salma — Centre Atlas");
    const english = familyLabelsFor(DEFAULT_VOCABULARY, null, "en");
    const custom = `Dear family, ${english.absenceAlerts.tokens.student} missed ${english.absenceAlerts.tokens.subject}. ${english.absenceAlerts.tokens.center}`;
    expect(renderAbsenceMessage(custom, absence, english, false, "en")).toBe("Dear family, Salma missed Maths. Centre Atlas");
  });
});
