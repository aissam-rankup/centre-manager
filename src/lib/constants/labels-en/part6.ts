import type { AppLabels } from "@/lib/constants/labels";

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** « 1 invoice » / « 3 invoices ». */
function plural(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

/** Libellés anglais : reenrollment. */
export const EN_PART6: Pick<AppLabels, "reenrollment"> = {
  reenrollment: {
    settings: {
      title: "Automatic re-enrolment",
      description:
        "Each month, next month's campaign is prepared as a draft: one line per {course} or pack for each active {learner}, discount deducted. Nothing is invoiced until the administrator confirms.",
      enabled: "Enable automatic re-enrolment",
      enabledHint:
        "When enabled, the campaign replaces each month's automatic billing. When disabled, invoices are still created on the cycle day, as they are today.",
      generationDay: "Preparation day",
      generationDayHint: (day: number) => `Next month's campaign is prepared on day ${day} of each month (1 to 28).`,
      dueDay: "Due day",
      dueDayHint: (month: string, first: string, fifteenth: string) =>
        `For ${month}: due on ${first} (1st cycle) and ${fifteenth} (15th cycle); overdue from the following day.`,
      dayInvalid: "Enter a day between 1 and 28.",
      next: "Next campaign",
      scheduled: (month: string, date: string) => `${capitalize(month)} campaign: prepared automatically on ${date}.`,
      tonight: (month: string) => `${capitalize(month)} campaign: prepared automatically tonight.`,
      missed: (month: string) =>
        `${capitalize(month)} campaign: the preparation day has passed. Prepare it now, otherwise ${capitalize(month)} invoices will be created as usual.`,
      disabledNotice: "Automatic re-enrolment disabled: billing stays automatic, on the cycle day.",
      currentDraft: (month: string) => `The ${capitalize(month)} campaign is not confirmed yet: its invoices are on hold.`,
      cancelledSummary: (month: string) => `${capitalize(month)}: month without classes, no invoices.`,
      prepareNow: "Prepare now",
      prepared: "Draft prepared",
      runStatus: {
        draft: "Draft to review",
        confirmed: "Confirmed",
        sent: "Reminders sent",
        closed: "Closed",
        cancelled: "Month without campaign",
      },
      runSummary: (month: string, students: number, total: string) =>
        `${month}: ${plural(students, "{learner}", "{learners}")}, ${total} to collect.`,
      generatedAuto: (date: string) => `Prepared automatically on ${date}.`,
      generatedBy: (date: string) => `Prepared on ${date}.`,
      openCampaign: "Open campaign",
    },
    review: {
      description:
        "Review the campaign before issuing invoices: each {learner}'s intention, at-risk {learners}, then confirmation by the administrator.",
      campaigns: "Campaigns",
      month: (month: string) => capitalize(month),
      emptyTitle: "No campaigns",
      emptyDescription:
        "Enable automatic re-enrolment in the settings: next month's campaign will be prepared there as a draft.",
      openSettings: "Open settings",
      status: {
        draft: "Draft",
        confirmed: "Confirmed",
        sent: "Reminders sent",
        closed: "Closed",
        cancelled: "Month without classes",
      },
      notice: {
        draft: "Draft: no invoices are issued before confirmation. {Learners} without a decision will be kept on.",
        draftAssistant:
          "Draft: record each {learner}'s intention. The administrator will confirm the campaign; {learners} without a decision will be kept on.",
        late: "The month has started: this campaign's invoices are awaiting confirmation.",
        confirmed: (date: string, name: string | null) =>
          `Confirmed on ${date}${name ? ` by ${name}` : ""}: invoices issued, amounts locked.`,
        cancelled: (reason: string | null) => `Month without classes: no invoices this month.${reason ? ` Reason: ${reason}` : ""}`,
        support: "Support mode: read-only.",
      },
      stats: {
        students: "{Learners} billed",
        expected: "Forecast",
        decisionsValue: (kept: number, dropped: number, paused: number) =>
          `${kept} continuing · ${plural(dropped, "dropout", "dropouts")} · ${plural(paused, "pause", "pauses")}`,
        pending: "No decision",
        risk: "At risk",
      },
      risk: {
        title: "At-risk {learners}",
        description: (threshold: number) =>
          `Overdue balance from a previous month, or attendance below ${threshold}% over 30 days: deal with these before invoicing.`,
        none: "No at-risk {learners} this month.",
        overdue: (amount: string) => `Unpaid ${amount}`,
        attendance: (rate: string) => `Attendance ${rate}`,
      },
      filters: {
        label: "Filter {learners}",
        all: (count: number) => `All (${count})`,
        risk: (count: number) => `At risk (${count})`,
        pending: (count: number) => `No decision (${count})`,
        confirmed: (count: number) => `Continuing (${count})`,
        leaving: (count: number) => `Dropouts and pauses (${count})`,
      },
      search: "Search for {a learner}",
      noMatch: "No {learners} match this filter.",
      intent: {
        pending: "No decision",
        confirmed: "Continuing",
        dropped: "Dropping out",
        paused: "On a break",
      },
      intentLabel: (name: string) => `${name}'s intention`,
      keepLine: (name: string) => `Keep ${name}`,
      lineRemoved: "Removed",
      pack: "Pack",
      full: "Full price",
      discount: "Discount",
      net: "Net payable",
      due: (date: string) => `Due on ${date}`,
      conflict: "Conflicting discounts: the most favourable one is applied.",
      noLine: "Nothing to invoice this month.",
      leavingNote: "No invoice this month; their {courses} stop at the start of their period.",
      applied: "Applied: {courses} stopped.",
      decided: (date: string, name: string | null) => `Decided on ${date}${name ? ` by ${name}` : ""}`,
      reasonShown: (reason: string) => `Reason: ${reason}`,
      saved: "Intention saved",
      openFile: "Profile",
      invoiceStatus: {
        pending: "To pay",
        overdue: "Overdue",
        paid: "Paid",
      },
      leaveDialog: {
        dropped: (name: string) => `${name} is dropping out`,
        paused: (name: string) => `${name} is taking a break`,
        description:
          "No invoice this month. Their {courses} will stop at the start of their period; resuming later is billed as usual.",
        reason: "Reason (optional)",
        reasonPlaceholder: "E.g. moving house, timetable, exams",
        submit: "Save",
      },
      confirm: {
        button: "Confirm campaign",
        title: (month: string) => `Confirm the ${capitalize(month)} campaign?`,
        summary: (students: number, lines: number, total: string) =>
          `${plural(students, "{learner}", "{learners}")}, ${plural(lines, "invoice", "invoices")}, ${total} to collect.`,
        decisions: (pending: number, dropped: number, paused: number) =>
          `${plural(pending, "{learner}", "{learners}")} without a decision will be kept on; ${plural(dropped, "dropout", "dropouts")}, ${plural(paused, "pause", "pauses")}.`,
        riskWarning: (count: number) =>
          `${count} at-risk ${count === 1 ? "{learner} has" : "{learners} have"} no decision yet.`,
        irreversible: "Invoices are issued and their amounts locked: the campaign can no longer be changed afterwards.",
        action: "Confirm and issue invoices",
        done: (count: number) => `${plural(count, "invoice", "invoices")} issued`,
      },
      cancel: {
        button: "Month without classes",
        title: (month: string) => `Declare ${capitalize(month)} a month without classes?`,
        description:
          "No invoices will be issued for this month, either by the campaign or by automatic billing. This choice is final.",
        reason: "Reason",
        reasonPlaceholder: "E.g. summer holidays",
        reasonRequired: "Enter the reason (300 characters max).",
        action: "Declare month without classes",
        done: "Month declared without classes",
      },
    },
    dashboard: {
      title: "Re-enrolment",
      campaign: (month: string, status: string) => `${capitalize(month)} campaign · ${status}`,
      counts: { confirmed: "Continuing", dropped: "Dropouts", paused: "Pauses", pending: "No decision" },
      removed: (count: number) => `including ${plural(count, "{learner}", "{learners}")} with {a course} removed`,
      bySubject: "By {course}",
      subjectLine: (kept: number, dropped: number) => `${kept} continuing · ${dropped} removed`,
      pack: "Pack",
      open: "Open campaign",
      lateDraft: (month: string) => `The ${capitalize(month)} campaign is not confirmed: this month's invoices are waiting.`,
      lateDraftAction: "Review and confirm",
    },
    reminders: {
      title: "Payment reminders",
      description: "Notify parents/guardians on WhatsApp: the message is written for you, and paid invoices never get a reminder.",
      disabled: "Payment reminders are disabled in the centre settings.",
      waves: { upcoming: "Before due date", due_today: "On the due date", overdue: "Overdue" },
      waveTab: (label: string, count: number) => `${label} (${count})`,
      waveLabel: "Reminder waves",
      empty: {
        upcoming: "No reminders before the due date.",
        due_today: "Nothing due today.",
        overdue: "Nothing overdue: everything is paid.",
      },
      due: (date: string) => `Due on ${date}`,
      late: (days: string) => `${days} late`,
      later: (date: string) => `Recommended from ${date}`,
      sent: (channel: string, date: string, by: string | null) =>
        by ? `Reminder sent ${channel} on ${date} by ${by}` : `Reminder sent ${channel} on ${date}`,
      notSent: "Not sent yet",
      followedUp: (date: string) => `Payment follow-up recorded on ${date}`,
      send: "Send reminder",
      sendAgain: "Follow up",
      otherChannel: "Other method",
      recordCall: "Call made",
      recordInPerson: "Seen in person",
      recorded: "Reminder recorded",
      noPhone: "No number: enter one to send the message.",
      nothingToSend: "Invoice already paid: no reminder.",
      sendAll: (count: number) => `Send all (${count})`,
      sequence: {
        title: "Send reminders",
        progress: (index: number, total: number) => `Reminder ${index} of ${total}`,
        open: "Open WhatsApp",
        skip: "Skip",
        done: "All reminders in this wave have been handled.",
        close: "Finish",
      },
      channels: { whatsapp: "via WhatsApp", phone_call: "by phone", in_person: "in person" },
      days: (count: number) => (count === 1 ? "1 day" : `${count} days`),
      studentTitle: "Reminders to send",
      tokens: {
        student: "[élève]",
        month: "[mois]",
        subjects: "[matières]",
        amount: "[montant]",
        date: "[date]",
        days: "[jours]",
        center: "[centre]",
      },
      templates: {
        upcoming:
          "Bonjour, les frais de [mois] pour [élève] s'élèvent à [montant] ([matières]), à régler au plus tard le [date]. Merci de votre confiance.\n[centre]",
        due_today:
          "Bonjour, nous vous rappelons que les frais de [mois] pour [élève], soit [montant] ([matières]), sont à régler aujourd'hui, [date]. Merci.\n[centre]",
        overdue:
          "Bonjour, les frais de [mois] pour [élève], soit [montant] ([matières]), étaient à régler le [date] : [jours] de retard. Merci de passer au centre dès que possible.\n[centre]",
      },
      history: (wave: string) => `Payment reminder · ${wave}`,
      historyDetail: (amount: string, subjects: string) => `${amount} · ${subjects}`,
      settings: {
        title: "Payment reminders",
        description: "WhatsApp messages suggested for parents/guardians once the month's campaign is confirmed.",
        enabled: "Suggest payment reminders",
        enabledHint: "Shows reminders on the Re-enrolment screen and on each {learner}'s profile.",
        daysBefore: "Reminder before due date",
        daysBeforeHint: (days: number) =>
          days === 0
            ? 'The "before due date" reminder is recommended on the day itself.'
            : `Recommended ${days === 1 ? "1 day" : `${days} days`} before the due date (0 to 28).`,
        daysInvalid: "Enter a number of days between 0 and 28.",
        template: {
          upcoming: "Message before due date",
          due_today: "Message on the due date",
          overdue: "Message when overdue",
        },
        templateHint: "Variables replaced when sending:",
        reset: "Restore the suggested message",
        preview: "Preview",
        // Valeurs d'exemple injectées dans les modèles (en français) pour l'aperçu : gardées en français.
        sample: {
          student: "Salma Bennani",
          month: "novembre",
          subjects: "Mathématiques, Anglais",
          amount: "550 MAD",
          date: "5 novembre",
          days: "3 jours",
        },
      },
    },
  },
};
