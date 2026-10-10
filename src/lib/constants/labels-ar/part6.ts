import type { AppLabels } from "@/lib/constants/labels";

/** Accord du nom avec le nombre : 1, 2, 3 à 10, 11 et plus. */
const plural = (n: number, one: string, two: string, few: string, many: string) =>
  n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? few : many;

/** « يوم واحد », « يومان », « 3 أيام », « 15 يومًا ». */
const dayCount = (n: number) =>
  n === 1 ? "يوم واحد" : n === 2 ? "يومان" : `${n} ${plural(n, "يوم", "يومان", "أيام", "يومًا")}`;

/** Libellés arabes : reenrollment. */
export const AR_PART6: Pick<AppLabels, "reenrollment"> = {
  reenrollment: {
    settings: {
      title: "إعادة التسجيل التلقائية",
      description:
        "كل شهر، تُحضَّر حملة الشهر الموالي كمسودة: سطر لكل {course} أو باقة ضمن التسجيلات النشطة، بعد خصم التخفيض. لا تُصدَر أي فاتورة قبل تأكيد المدير.",
      enabled: "تفعيل إعادة التسجيل التلقائية",
      enabledHint:
        "عند تفعيلها، تحل الحملة محل الفوترة التلقائية كل شهر. وعند إيقافها، تستمر الفواتير في الإنشاء يوم الدورة، كما هو الحال الآن.",
      generationDay: "يوم التحضير",
      generationDayHint: (day: number) => `تُحضَّر حملة الشهر الموالي يوم ${day} من كل شهر (من 1 إلى 28).`,
      dueDay: "يوم الاستحقاق",
      dueDayHint: (month: string, first: string, fifteenth: string) =>
        `بالنسبة لشهر ${month}: الاستحقاق في ${first} (دورة اليوم 1) وفي ${fifteenth} (دورة اليوم 15)؛ ويبدأ التأخر من اليوم الموالي.`,
      dayInvalid: "أدخل يومًا بين 1 و28.",
      next: "الحملة المقبلة",
      scheduled: (month: string, date: string) => `حملة شهر ${month}: تُحضَّر تلقائيًا في ${date}.`,
      tonight: (month: string) => `حملة شهر ${month}: تُحضَّر تلقائيًا هذه الليلة.`,
      missed: (month: string) =>
        `حملة شهر ${month}: فات يوم التحضير. حضّرها الآن، وإلا ستُنشأ فواتير شهر ${month} كالمعتاد.`,
      disabledNotice: "إعادة التسجيل التلقائية معطّلة: تبقى الفوترة تلقائية يوم الدورة.",
      currentDraft: (month: string) => `حملة شهر ${month} لم تُؤكَّد بعد: فواتيرها معلّقة.`,
      cancelledSummary: (month: string) => `${month}: شهر بدون دروس، لا توجد فواتير.`,
      prepareNow: "التحضير الآن",
      prepared: "تم تحضير المسودة",
      runStatus: {
        draft: "مسودة للمراجعة",
        confirmed: "مؤكَّدة",
        sent: "أُرسلت التذكيرات",
        closed: "مغلقة",
        cancelled: "شهر بدون حملة",
      },
      runSummary: (month: string, students: number, total: string) =>
        `${month}: عدد {the learners} ${students}، والمبلغ المراد تحصيله ${total}.`,
      generatedAuto: (date: string) => `حُضّرت تلقائيًا في ${date}.`,
      generatedBy: (date: string) => `حُضّرت في ${date}.`,
      openCampaign: "فتح الحملة",
    },
    review: {
      description:
        "راجع الحملة قبل إصدار الفواتير: نية كل {learner}، ثم {the learners} في وضعية خطر، ثم تأكيد المدير.",
      campaigns: "الحملات",
      month: (month: string) => month,
      emptyTitle: "لا توجد حملات",
      emptyDescription: "فعّل إعادة التسجيل التلقائية في الإعدادات: ستُحضَّر فيها حملة الشهر الموالي كمسودة.",
      openSettings: "فتح الإعدادات",
      status: {
        draft: "مسودة",
        confirmed: "مؤكَّدة",
        sent: "أُرسلت التذكيرات",
        closed: "مغلقة",
        cancelled: "شهر بدون دروس",
      },
      notice: {
        draft: "مسودة: لا تُصدَر أي فاتورة قبل التأكيد. سيُجدَّد تلقائيًا تسجيل {the learners} دون قرار.",
        draftAssistant:
          "مسودة: سجّل نية {the learners}. سيؤكد المدير الحملة؛ وسيُجدَّد تلقائيًا تسجيل {the learners} دون قرار.",
        late: "بدأ الشهر: فواتير هذه الحملة في انتظار التأكيد.",
        confirmed: (date: string, name: string | null) =>
          `أُكّدت في ${date}${name ? ` من طرف ${name}` : ""}: صدرت الفواتير وثُبّتت المبالغ.`,
        cancelled: (reason: string | null) => `شهر بدون دروس: لا فواتير هذا الشهر.${reason ? ` السبب: ${reason}` : ""}`,
        support: "وضع الدعم: قراءة فقط.",
      },
      stats: {
        students: "{the learners} المفوترون",
        expected: "المتوقع",
        decisionsValue: (kept: number, dropped: number, paused: number) =>
          `تجديد: ${kept} · انقطاع: ${dropped} · توقف مؤقت: ${paused}`,
        pending: "دون قرار",
        risk: "في وضعية خطر",
      },
      risk: {
        title: "{the learners} في وضعية خطر",
        description: (threshold: number) =>
          `مبالغ غير مؤداة متأخرة من شهر سابق، أو نسبة حضور أقل من ${threshold}% خلال 30 يومًا: يجب معالجتها قبل الفوترة.`,
        none: "لا يوجد أي {learner} في وضعية خطر هذا الشهر.",
        overdue: (amount: string) => `غير مؤدى: ${amount}`,
        attendance: (rate: string) => `الحضور: ${rate}`,
      },
      filters: {
        label: "تصفية {the learners}",
        all: (count: number) => `الكل (${count})`,
        risk: (count: number) => `في وضعية خطر (${count})`,
        pending: (count: number) => `دون قرار (${count})`,
        confirmed: (count: number) => `التجديدات (${count})`,
        leaving: (count: number) => `الانقطاعات والتوقفات (${count})`,
      },
      search: "البحث عن {learner}",
      noMatch: "لا توجد نتائج مطابقة لهذه التصفية.",
      intent: {
        pending: "دون قرار",
        confirmed: "تجديد",
        dropped: "انقطاع",
        paused: "توقف مؤقت",
      },
      intentLabel: (name: string) => `نية ${name}`,
      keepLine: (name: string) => `الإبقاء على ${name}`,
      lineRemoved: "تمت الإزالة",
      pack: "الباقة",
      full: "السعر الكامل",
      discount: "التخفيض",
      net: "الصافي للأداء",
      due: (date: string) => `الاستحقاق في ${date}`,
      conflict: "تخفيضات متعارضة: يُطبَّق الأكثر فائدة.",
      noLine: "لا شيء للفوترة هذا الشهر.",
      leavingNote: "لا فاتورة هذا الشهر؛ تتوقف {the courses} في بداية فترتها.",
      applied: "طُبِّق: أُوقفت {the courses}.",
      decided: (date: string, name: string | null) => `تقرّر في ${date}${name ? ` من طرف ${name}` : ""}`,
      reasonShown: (reason: string) => `السبب: ${reason}`,
      saved: "تم حفظ النية",
      openFile: "الملف",
      invoiceStatus: {
        pending: "في انتظار الأداء",
        overdue: "متأخرة",
        paid: "مؤداة",
      },
      leaveDialog: {
        dropped: (name: string) => `${name}: انقطاع`,
        paused: (name: string) => `${name}: توقف مؤقت`,
        description:
          "لا فاتورة هذا الشهر. ستتوقف {the courses} في بداية فترتها؛ والاستئناف لاحقًا يُفوتَر بشكل عادي.",
        reason: "السبب (اختياري)",
        reasonPlaceholder: "مثال: تغيير السكن، استعمال الزمن، الامتحانات",
        submit: "حفظ",
      },
      confirm: {
        button: "تأكيد الحملة",
        title: (month: string) => `تأكيد حملة شهر ${month}؟`,
        summary: (students: number, lines: number, total: string) =>
          `عدد {the learners}: ${students}، عدد الفواتير: ${lines}، المبلغ المراد تحصيله: ${total}.`,
        decisions: (pending: number, dropped: number, paused: number) =>
          `سيُجدَّد تلقائيًا تسجيل {the learners} دون قرار (${pending})؛ انقطاع: ${dropped}، توقف مؤقت: ${paused}.`,
        riskWarning: (count: number) => `{the learners} في وضعية خطر دون قرار بعد: ${count}.`,
        irreversible: "تُصدَر الفواتير وتُثبَّت مبالغها: لا يمكن تعديل الحملة بعد ذلك.",
        action: "التأكيد وإصدار الفواتير",
        done: (count: number) => `تم إصدار الفواتير: ${count}`,
      },
      cancel: {
        button: "شهر بدون دروس",
        title: (month: string) => `إعلان شهر ${month} شهرًا بدون دروس؟`,
        description:
          "لن تُصدَر أي فاتورة لهذا الشهر، لا عبر الحملة ولا عبر الفوترة التلقائية. هذا الاختيار نهائي.",
        reason: "السبب",
        reasonPlaceholder: "مثال: العطلة الصيفية",
        reasonRequired: "أدخل السبب (300 حرف كحد أقصى).",
        action: "إعلان الشهر بدون دروس",
        done: "تم إعلان الشهر بدون دروس",
      },
    },
    dashboard: {
      title: "إعادة التسجيل",
      campaign: (month: string, status: string) => `حملة شهر ${month} · ${status}`,
      counts: { confirmed: "التجديدات", dropped: "الانقطاعات", paused: "التوقفات المؤقتة", pending: "دون قرار" },
      removed: (count: number) => `من بينهم، مع إزالة {course}: ${count}`,
      bySubject: "حسب {the course}",
      subjectLine: (kept: number, dropped: number) => `تجديد: ${kept} · إزالة: ${dropped}`,
      pack: "الباقة",
      open: "فتح الحملة",
      lateDraft: (month: string) => `حملة شهر ${month} غير مؤكَّدة: فواتير الشهر في الانتظار.`,
      lateDraftAction: "المراجعة والتأكيد",
    },
    reminders: {
      title: "تذكيرات الأداء",
      description: "نبّه أولياء الأمور عبر WhatsApp: الرسالة محرّرة مسبقًا، والفواتير المؤداة لا تتلقى أي تذكير أبدًا.",
      disabled: "تذكيرات الأداء معطّلة في إعدادات المركز.",
      waves: { upcoming: "قبل تاريخ الاستحقاق", due_today: "يوم الاستحقاق", overdue: "متأخرة" },
      waveTab: (label: string, count: number) => `${label} (${count})`,
      waveLabel: "موجات التذكير",
      empty: {
        upcoming: "لا يوجد تذكير قبل تاريخ الاستحقاق.",
        due_today: "لا يوجد استحقاق اليوم.",
        overdue: "لا يوجد تأخير: كل شيء مؤدى.",
      },
      due: (date: string) => `الاستحقاق في ${date}`,
      late: (days: string) => `التأخير: ${days}`,
      later: (date: string) => `يُنصح به ابتداءً من ${date}`,
      sent: (channel: string, date: string, by: string | null) =>
        by ? `أُرسل التذكير ${channel} في ${date} من طرف ${by}` : `أُرسل التذكير ${channel} في ${date}`,
      notSent: "لم يُرسَل بعد",
      followedUp: (date: string) => `سُجّلت متابعة الأداء في ${date}`,
      send: "إرسال التذكير",
      sendAgain: "إعادة التذكير",
      otherChannel: "وسيلة أخرى",
      recordCall: "تم الاتصال",
      recordInPerson: "تمت المقابلة حضوريًا",
      recorded: "تم تسجيل التذكير",
      noPhone: "لا يوجد رقم: أدخله لإرسال الرسالة.",
      nothingToSend: "الفاتورة مؤداة مسبقًا: لا تذكير.",
      sendAll: (count: number) => `إرسال الكل (${count})`,
      sequence: {
        title: "إرسال التذكيرات",
        progress: (index: number, total: number) => `التذكير ${index} من ${total}`,
        open: "فتح WhatsApp",
        skip: "تخطي",
        done: "تمت معالجة جميع تذكيرات هذه الموجة.",
        close: "إنهاء",
      },
      channels: { whatsapp: "عبر WhatsApp", phone_call: "عبر الهاتف", in_person: "حضوريًا" },
      days: (count: number) => dayCount(count),
      studentTitle: "تذكيرات للإرسال",
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
      history: (wave: string) => `تذكير بالأداء · ${wave}`,
      historyDetail: (amount: string, subjects: string) => `${amount} · ${subjects}`,
      settings: {
        title: "تذكيرات الأداء",
        description: "رسائل WhatsApp مقترحة لأولياء الأمور بعد تأكيد حملة الشهر.",
        enabled: "اقتراح تذكيرات الأداء",
        enabledHint: "يعرض التذكيرات في شاشة إعادة التسجيل وفي ملف كل {learner}.",
        daysBefore: "التذكير قبل تاريخ الاستحقاق",
        daysBeforeHint: (days: number) =>
          days === 0
            ? "يُنصح بتذكير « قبل تاريخ الاستحقاق » في اليوم نفسه."
            : `المدة الموصى بها قبل تاريخ الاستحقاق: ${dayCount(days)} (من 0 إلى 28).`,
        daysInvalid: "أدخل عددًا من الأيام بين 0 و28.",
        template: {
          upcoming: "الرسالة قبل تاريخ الاستحقاق",
          due_today: "الرسالة يوم الاستحقاق",
          overdue: "الرسالة في حالة التأخر",
        },
        templateHint: "متغيرات تُستبدل عند الإرسال:",
        reset: "استعادة الرسالة المقترحة",
        preview: "معاينة",
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
