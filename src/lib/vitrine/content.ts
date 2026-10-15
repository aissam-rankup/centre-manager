import type { Locale } from "@/lib/i18n/locale";

/**
 * Textes de la vitrine (dirassty.com), en français, anglais et arabe.
 * Le français fait référence ; les trois versions ont exactement la même forme
 * (le typage refuse un texte manquant).
 */

/** Numéro WhatsApp des demandes de démo (format international, sans « + »). */
export const DEMO_WHATSAPP = "212604778249";

export type FeatureKey =
  | "students"
  | "payments"
  | "absences"
  | "schedule"
  | "payroll"
  | "cash"
  | "reenrollment"
  | "studentSpace"
  | "whiteLabel";

export type DemoRequest = { name: string; center: string; city: string; phone: string };

type Item = { title: string; text: string };

export type VitrineContent = {
  meta: { title: string; description: string };
  nav: { features: string; plans: string; faq: string; login: string; demo: string; language: string; menu: string; close: string };
  hero: { badge: string; title: string; highlight: string; subtitle: string; demo: string; login: string; points: [string, string, string] };
  preview: {
    label: string;
    center: string;
    collected: string;
    collectedValue: string;
    attendance: string;
    attendanceValue: string;
    unpaid: string;
    unpaidValue: string;
    recent: string;
    payments: { name: string; detail: string; amount: string }[];
    receiptSent: string;
  };
  features: { title: string; subtitle: string; premium: string; items: Record<FeatureKey, Item> };
  audiences: { title: string; subtitle: string; items: [Item, Item, Item, Item] };
  plans: {
    title: string;
    subtitle: string;
    onRequest: string;
    cta: string;
    starter: { name: string; description: string; features: string[] };
    premium: { name: string; badge: string; description: string; features: string[] };
  };
  steps: { title: string; items: [Item, Item, Item] };
  faq: { title: string; items: { question: string; answer: string }[] };
  cta: { title: string; text: string; button: string };
  footer: { tagline: string; contact: string; staffLogin: string; studentLogin: string; rights: string };
  demo: {
    title: string;
    description: string;
    name: string;
    center: string;
    city: string;
    phone: string;
    optional: string;
    required: string;
    submit: string;
    cancel: string;
    note: string;
    message: (request: DemoRequest) => string;
  };
};

const fr: VitrineContent = {
  meta: {
    title: "dirassty — Logiciel de gestion pour centres de soutien, de langues et de formation",
    description:
      "Élèves, paiements, reçus WhatsApp, absences, planning, paie et réinscriptions : gérez tout votre centre au même endroit, sur ordinateur et téléphone.",
  },
  nav: {
    features: "Fonctionnalités",
    plans: "Offres",
    faq: "Questions",
    login: "Se connecter",
    demo: "Demander une démo",
    language: "Langue",
    menu: "Ouvrir le menu",
    close: "Fermer le menu",
  },
  hero: {
    badge: "Pour les centres de soutien, de langues et de formation",
    title: "Gérez votre centre",
    highlight: "en toute simplicité",
    subtitle:
      "Élèves, paiements, absences, planning et paie : tout votre centre au même endroit, avec les reçus et les alertes envoyés aux parents par WhatsApp.",
    demo: "Demander une démo",
    login: "Se connecter",
    points: ["Votre adresse : votre-centre.dirassty.com", "Sur ordinateur et téléphone", "Mise en place accompagnée"],
  },
  preview: {
    label: "Aperçu du tableau de bord",
    center: "Centre Al Amal",
    collected: "Encaissé ce mois",
    collectedValue: "48 600 MAD",
    attendance: "Présence aujourd'hui",
    attendanceValue: "94 %",
    unpaid: "Impayés",
    unpaidValue: "3",
    recent: "Derniers paiements",
    payments: [
      { name: "Yassine B.", detail: "Mathématiques · 2e année Bac", amount: "450 MAD" },
      { name: "Salma E.", detail: "Anglais · Niveau B1", amount: "300 MAD" },
      { name: "Omar K.", detail: "Physique-Chimie · Tronc commun", amount: "350 MAD" },
    ],
    receiptSent: "Reçu envoyé par WhatsApp",
  },
  features: {
    title: "Tout ce dont votre centre a besoin",
    subtitle: "Une seule application pour l'administration, l'accueil, les professeurs et les élèves.",
    premium: "Premium",
    items: {
      students: {
        title: "Élèves et inscriptions",
        text: "Fiches élèves, niveaux, matières, packs et remises. Chaque inscription crée ses factures mensuelles.",
      },
      payments: {
        title: "Paiements et reçus",
        text: "Encaissements, reçus PDF envoyés par WhatsApp en un clic et relances des impayés.",
      },
      absences: {
        title: "Absences et alertes",
        text: "Appel fait par le professeur ou l'accueil ; les parents sont prévenus par WhatsApp en cas d'absences répétées.",
      },
      schedule: {
        title: "Planning et salles",
        text: "Emploi du temps de chaque professeur et de chaque salle ; les conflits sont détectés avant d'être enregistrés.",
      },
      payroll: {
        title: "Paie des professeurs",
        text: "Salaire fixe ou commission par élève : la paie du mois se calcule à partir des inscriptions.",
      },
      cash: {
        title: "Caisse et charges",
        text: "Caisse du jour, charges du centre et tableau de bord financier pour suivre votre activité.",
      },
      reenrollment: {
        title: "Réinscriptions",
        text: "Campagnes de réinscription : chaque élève confirme ses matières et les factures du mois suivant sont prêtes.",
      },
      studentSpace: {
        title: "Espace élève et ressources",
        text: "Les élèves se connectent pour retrouver les cours, exercices et examens publiés par leurs professeurs.",
      },
      whiteLabel: {
        title: "Marque blanche",
        text: "Votre logo, vos couleurs et votre nom sur l'écran de connexion et les reçus.",
      },
    },
  },
  audiences: {
    title: "Pensé pour votre type de centre",
    subtitle: "Le vocabulaire s'adapte : élèves ou stagiaires, matières ou modules, professeurs ou formateurs.",
    items: [
      { title: "Soutien scolaire", text: "Niveaux du primaire au bac, matières, séances et suivi des parents." },
      { title: "Écoles de langues", text: "Niveaux, groupes, sessions et inscriptions au mois ou au trimestre." },
      { title: "Centres de formation", text: "Promotions, modules, formateurs et sessions de formation professionnelle." },
      { title: "Autres centres", text: "Musique, arts, informatique : un vocabulaire sur mesure pour votre activité." },
    ],
  },
  plans: {
    title: "Deux offres, selon vos besoins",
    subtitle: "Les tarifs dépendent de la taille de votre centre : demandez une démo pour recevoir votre devis.",
    onRequest: "Tarif sur demande",
    cta: "Demander une démo",
    starter: {
      name: "Débutant",
      description: "La gestion complète de votre centre.",
      features: [
        "Élèves, inscriptions, packs et remises",
        "Paiements, reçus WhatsApp et relances",
        "Absences et alertes aux parents",
        "Planning, salles et conflits",
        "Paie des professeurs, caisse et charges",
        "Réinscriptions",
      ],
    },
    premium: {
      name: "Premium",
      badge: "Le plus complet",
      description: "Tout Débutant, plus l'espace élève et votre marque.",
      features: [
        "Tout ce que contient Débutant",
        "Espace élève avec connexion par code",
        "Cours, exercices et examens publiés par les professeurs",
        "Marque blanche : logo, couleurs et nom du centre",
      ],
    },
  },
  steps: {
    title: "Démarrez en trois étapes",
    items: [
      { title: "Demandez une démo", text: "Envoyez-nous un message WhatsApp : nous vous présentons dirassty selon votre centre." },
      { title: "Nous préparons votre centre", text: "Votre adresse dirassty, votre type de centre et les comptes de votre équipe." },
      { title: "Votre équipe démarre", text: "Administration, accueil, professeurs et élèves se connectent depuis votre adresse." },
    ],
  },
  faq: {
    title: "Questions fréquentes",
    items: [
      {
        question: "Faut-il installer un logiciel ?",
        answer: "Non. dirassty s'utilise dans le navigateur, sur ordinateur, tablette ou téléphone.",
      },
      {
        question: "Chaque centre a-t-il sa propre adresse ?",
        answer: "Oui : votre centre est accessible sur votre-centre.dirassty.com, avec son propre écran de connexion.",
      },
      {
        question: "Qui voit les données de mon centre ?",
        answer:
          "Seuls les comptes de votre centre, selon leur rôle : administration, accueil, professeurs et élèves. Chaque centre est cloisonné.",
      },
      {
        question: "Comment les parents reçoivent-ils les reçus et les alertes ?",
        answer: "Par WhatsApp : l'accueil envoie le reçu ou l'alerte d'absence au numéro du responsable en un clic.",
      },
      {
        question: "Comment commencer ?",
        answer: "Demandez une démo par WhatsApp : nous vous montrons l'application et préparons votre centre avec vous.",
      },
    ],
  },
  cta: {
    title: "Prêt à simplifier la gestion de votre centre ?",
    text: "Parlez-nous de votre centre : nous vous répondons sur WhatsApp.",
    button: "Demander une démo",
  },
  footer: {
    tagline: "La gestion des centres de soutien, de langues et de formation.",
    contact: "WhatsApp : 06 04 77 82 49",
    staffLogin: "Connexion de l'équipe",
    studentLogin: "Espace élève",
    rights: "Tous droits réservés.",
  },
  demo: {
    title: "Demander une démo",
    description: "Laissez-nous vos coordonnées : votre demande s'ouvre dans WhatsApp, prête à être envoyée.",
    name: "Votre nom",
    center: "Nom du centre",
    city: "Ville",
    phone: "Téléphone",
    optional: "facultatif",
    required: "Ce champ est obligatoire.",
    submit: "Envoyer sur WhatsApp",
    cancel: "Annuler",
    note: "Vous pourrez relire le message avant de l'envoyer.",
    message: ({ name, center, city, phone }) =>
      [
        "Bonjour, je souhaite une démonstration de dirassty.",
        `Nom : ${name}`,
        `Centre : ${center}`,
        city ? `Ville : ${city}` : null,
        phone ? `Téléphone : ${phone}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
  },
};

const en: VitrineContent = {
  meta: {
    title: "dirassty — Management software for tutoring, language and training centres",
    description:
      "Students, payments, WhatsApp receipts, absences, timetable, payroll and re-enrolment: run your whole centre in one place, on computer and phone.",
  },
  nav: {
    features: "Features",
    plans: "Plans",
    faq: "FAQ",
    login: "Log in",
    demo: "Request a demo",
    language: "Language",
    menu: "Open menu",
    close: "Close menu",
  },
  hero: {
    badge: "For tutoring, language and training centres",
    title: "Run your centre",
    highlight: "the simple way",
    subtitle:
      "Students, payments, absences, timetable and payroll: your whole centre in one place, with receipts and alerts sent to parents on WhatsApp.",
    demo: "Request a demo",
    login: "Log in",
    points: ["Your address: your-centre.dirassty.com", "On computer and phone", "Guided setup"],
  },
  preview: {
    label: "Dashboard preview",
    center: "Al Amal Centre",
    collected: "Collected this month",
    collectedValue: "48,600 MAD",
    attendance: "Attendance today",
    attendanceValue: "94%",
    unpaid: "Unpaid",
    unpaidValue: "3",
    recent: "Latest payments",
    payments: [
      { name: "Yassine B.", detail: "Mathematics · Baccalaureate year 2", amount: "450 MAD" },
      { name: "Salma E.", detail: "English · Level B1", amount: "300 MAD" },
      { name: "Omar K.", detail: "Physics & Chemistry · Common core", amount: "350 MAD" },
    ],
    receiptSent: "Receipt sent on WhatsApp",
  },
  features: {
    title: "Everything your centre needs",
    subtitle: "One app for management, front desk, teachers and students.",
    premium: "Premium",
    items: {
      students: {
        title: "Students and enrolment",
        text: "Student records, levels, subjects, bundles and discounts. Each enrolment creates its monthly invoices.",
      },
      payments: {
        title: "Payments and receipts",
        text: "Payments, PDF receipts sent on WhatsApp in one click, and reminders for unpaid fees.",
      },
      absences: {
        title: "Absences and alerts",
        text: "Attendance taken by the teacher or the front desk; parents are notified on WhatsApp after repeated absences.",
      },
      schedule: {
        title: "Timetable and rooms",
        text: "Each teacher's and each room's timetable; clashes are detected before they are saved.",
      },
      payroll: {
        title: "Teacher payroll",
        text: "Fixed salary or commission per student: monthly payroll is calculated from enrolments.",
      },
      cash: {
        title: "Cash desk and expenses",
        text: "Daily cash desk, centre expenses and a financial dashboard to follow your activity.",
      },
      reenrollment: {
        title: "Re-enrolment",
        text: "Re-enrolment campaigns: each student confirms their subjects and next month's invoices are ready.",
      },
      studentSpace: {
        title: "Student space and resources",
        text: "Students log in to find the lessons, exercises and exams published by their teachers.",
      },
      whiteLabel: {
        title: "White label",
        text: "Your logo, your colours and your name on the login screen and on receipts.",
      },
    },
  },
  audiences: {
    title: "Built for your kind of centre",
    subtitle: "The wording adapts: students or trainees, subjects or modules, teachers or trainers.",
    items: [
      { title: "Tutoring centres", text: "Levels from primary school to baccalaureate, subjects, sessions and parent follow-up." },
      { title: "Language schools", text: "Levels, groups, sessions and monthly or term enrolments." },
      { title: "Training centres", text: "Cohorts, modules, trainers and vocational training sessions." },
      { title: "Other centres", text: "Music, arts, computing: wording tailored to your activity." },
    ],
  },
  plans: {
    title: "Two plans, to fit your needs",
    subtitle: "Pricing depends on the size of your centre: request a demo to receive your quote.",
    onRequest: "Price on request",
    cta: "Request a demo",
    starter: {
      name: "Starter",
      description: "Complete management of your centre.",
      features: [
        "Students, enrolment, bundles and discounts",
        "Payments, WhatsApp receipts and reminders",
        "Absences and parent alerts",
        "Timetable, rooms and clashes",
        "Teacher payroll, cash desk and expenses",
        "Re-enrolment",
      ],
    },
    premium: {
      name: "Premium",
      badge: "Most complete",
      description: "Everything in Starter, plus the student space and your brand.",
      features: [
        "Everything in Starter",
        "Student space with code login",
        "Lessons, exercises and exams published by teachers",
        "White label: your centre's logo, colours and name",
      ],
    },
  },
  steps: {
    title: "Get started in three steps",
    items: [
      { title: "Request a demo", text: "Send us a WhatsApp message: we show you dirassty for your kind of centre." },
      { title: "We set up your centre", text: "Your dirassty address, your type of centre and your team's accounts." },
      { title: "Your team gets going", text: "Management, front desk, teachers and students log in from your address." },
    ],
  },
  faq: {
    title: "Frequently asked questions",
    items: [
      {
        question: "Do I need to install any software?",
        answer: "No. dirassty runs in the browser, on computer, tablet or phone.",
      },
      {
        question: "Does each centre have its own address?",
        answer: "Yes: your centre is available at your-centre.dirassty.com, with its own login screen.",
      },
      {
        question: "Who can see my centre's data?",
        answer:
          "Only your centre's accounts, according to their role: management, front desk, teachers and students. Each centre is kept separate.",
      },
      {
        question: "How do parents receive receipts and alerts?",
        answer: "On WhatsApp: the front desk sends the receipt or absence alert to the parent's number in one click.",
      },
      {
        question: "How do I get started?",
        answer: "Request a demo on WhatsApp: we show you the app and set up your centre with you.",
      },
    ],
  },
  cta: {
    title: "Ready to make running your centre simpler?",
    text: "Tell us about your centre: we reply on WhatsApp.",
    button: "Request a demo",
  },
  footer: {
    tagline: "Management for tutoring, language and training centres.",
    contact: "WhatsApp: +212 6 04 77 82 49",
    staffLogin: "Team login",
    studentLogin: "Student space",
    rights: "All rights reserved.",
  },
  demo: {
    title: "Request a demo",
    description: "Leave us your details: your request opens in WhatsApp, ready to send.",
    name: "Your name",
    center: "Centre name",
    city: "City",
    phone: "Phone",
    optional: "optional",
    required: "This field is required.",
    submit: "Send on WhatsApp",
    cancel: "Cancel",
    note: "You can review the message before sending it.",
    message: ({ name, center, city, phone }) =>
      [
        "Hello, I would like a demo of dirassty.",
        `Name: ${name}`,
        `Centre: ${center}`,
        city ? `City: ${city}` : null,
        phone ? `Phone: ${phone}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
  },
};

const ar: VitrineContent = {
  meta: {
    title: "dirassty — برنامج تسيير مراكز الدعم واللغات والتكوين",
    description:
      "التلاميذ، الأداءات، الوصولات عبر واتساب، الغيابات، استعمال الزمن، الأجور وإعادة التسجيل: سيّر مركزك بالكامل من مكان واحد، على الحاسوب والهاتف.",
  },
  nav: {
    features: "المميزات",
    plans: "العروض",
    faq: "الأسئلة",
    login: "تسجيل الدخول",
    demo: "اطلب عرضًا تجريبيًا",
    language: "اللغة",
    menu: "فتح القائمة",
    close: "إغلاق القائمة",
  },
  hero: {
    badge: "لمراكز الدعم المدرسي واللغات والتكوين",
    title: "سيّر مركزك",
    highlight: "بكل سهولة",
    subtitle:
      "التلاميذ، الأداءات، الغيابات، استعمال الزمن والأجور: مركزك بالكامل في مكان واحد، مع إرسال الوصولات والتنبيهات إلى أولياء الأمور عبر واتساب.",
    demo: "اطلب عرضًا تجريبيًا",
    login: "تسجيل الدخول",
    points: ["عنوانك: your-centre.dirassty.com", "على الحاسوب والهاتف", "مرافقة في الانطلاق"],
  },
  preview: {
    label: "معاينة لوحة القيادة",
    center: "مركز الأمل",
    collected: "المحصّل هذا الشهر",
    collectedValue: "48 600 درهم",
    attendance: "الحضور اليوم",
    attendanceValue: "94٪",
    unpaid: "غير المؤدّى",
    unpaidValue: "3",
    recent: "آخر الأداءات",
    payments: [
      { name: "ياسين ب.", detail: "الرياضيات · الثانية باكالوريا", amount: "450 درهم" },
      { name: "سلمى إ.", detail: "الإنجليزية · المستوى B1", amount: "300 درهم" },
      { name: "عمر ك.", detail: "الفيزياء والكيمياء · الجذع المشترك", amount: "350 درهم" },
    ],
    receiptSent: "أُرسل الوصل عبر واتساب",
  },
  features: {
    title: "كل ما يحتاجه مركزك",
    subtitle: "تطبيق واحد للإدارة والاستقبال والأساتذة والتلاميذ.",
    premium: "بريميوم",
    items: {
      students: {
        title: "التلاميذ والتسجيلات",
        text: "ملفات التلاميذ، المستويات، المواد، الباقات والتخفيضات. كل تسجيل يُنشئ فواتيره الشهرية.",
      },
      payments: {
        title: "الأداءات والوصولات",
        text: "تسجيل الأداءات، وصولات PDF تُرسل عبر واتساب بنقرة واحدة، وتذكير بالمبالغ غير المؤدّاة.",
      },
      absences: {
        title: "الغيابات والتنبيهات",
        text: "يسجّل الأستاذ أو الاستقبال الحضور، ويُخبَر أولياء الأمور عبر واتساب عند تكرار الغياب.",
      },
      schedule: {
        title: "استعمال الزمن والقاعات",
        text: "استعمال زمن كل أستاذ وكل قاعة، مع كشف التعارضات قبل تسجيلها.",
      },
      payroll: {
        title: "أجور الأساتذة",
        text: "أجر ثابت أو عمولة عن كل تلميذ: تُحتسب أجور الشهر انطلاقًا من التسجيلات.",
      },
      cash: {
        title: "الصندوق والمصاريف",
        text: "صندوق اليوم، مصاريف المركز ولوحة قيادة مالية لتتبّع نشاطك.",
      },
      reenrollment: {
        title: "إعادة التسجيل",
        text: "حملات إعادة التسجيل: يؤكّد كل تلميذ مواده وتكون فواتير الشهر الموالي جاهزة.",
      },
      studentSpace: {
        title: "فضاء التلميذ والموارد",
        text: "يدخل التلاميذ ليجدوا الدروس والتمارين والامتحانات التي ينشرها أساتذتهم.",
      },
      whiteLabel: {
        title: "علامتك الخاصة",
        text: "شعارك وألوانك واسم مركزك على شاشة الدخول وعلى الوصولات.",
      },
    },
  },
  audiences: {
    title: "مصمَّم حسب نوع مركزك",
    subtitle: "تتكيّف المصطلحات: تلاميذ أو متدرّبون، مواد أو وحدات، أساتذة أو مكوّنون.",
    items: [
      { title: "الدعم المدرسي", text: "المستويات من الابتدائي إلى الباكالوريا، المواد، الحصص وتتبّع أولياء الأمور." },
      { title: "مدارس اللغات", text: "المستويات، المجموعات، الدورات والتسجيل الشهري أو الفصلي." },
      { title: "مراكز التكوين", text: "الأفواج، الوحدات، المكوّنون ودورات التكوين المهني." },
      { title: "مراكز أخرى", text: "الموسيقى، الفنون، الإعلاميات: مصطلحات على مقاس نشاطك." },
    ],
  },
  plans: {
    title: "عرضان حسب احتياجاتك",
    subtitle: "تختلف الأسعار حسب حجم مركزك: اطلب عرضًا تجريبيًا لتتوصّل بعرض السعر.",
    onRequest: "السعر عند الطلب",
    cta: "اطلب عرضًا تجريبيًا",
    starter: {
      name: "الأساسي",
      description: "تسيير كامل لمركزك.",
      features: [
        "التلاميذ، التسجيلات، الباقات والتخفيضات",
        "الأداءات، وصولات واتساب والتذكيرات",
        "الغيابات وتنبيهات أولياء الأمور",
        "استعمال الزمن، القاعات والتعارضات",
        "أجور الأساتذة، الصندوق والمصاريف",
        "إعادة التسجيل",
      ],
    },
    premium: {
      name: "بريميوم",
      badge: "الأكثر اكتمالًا",
      description: "كل ما في الأساسي، مع فضاء التلميذ وعلامتك الخاصة.",
      features: [
        "كل ما يتضمّنه العرض الأساسي",
        "فضاء التلميذ مع الدخول برمز",
        "دروس وتمارين وامتحانات ينشرها الأساتذة",
        "علامتك الخاصة: شعار المركز وألوانه واسمه",
      ],
    },
  },
  steps: {
    title: "ابدأ في ثلاث خطوات",
    items: [
      { title: "اطلب عرضًا تجريبيًا", text: "أرسل لنا رسالة عبر واتساب: نقدّم لك dirassty حسب نوع مركزك." },
      { title: "نُجهّز مركزك", text: "عنوان مركزك على dirassty، نوع المركز وحسابات فريقك." },
      { title: "ينطلق فريقك", text: "الإدارة والاستقبال والأساتذة والتلاميذ يدخلون من عنوان مركزك." },
    ],
  },
  faq: {
    title: "أسئلة شائعة",
    items: [
      {
        question: "هل يجب تثبيت برنامج؟",
        answer: "لا. يعمل dirassty في المتصفّح، على الحاسوب أو اللوحة أو الهاتف.",
      },
      {
        question: "هل لكل مركز عنوانه الخاص؟",
        answer: "نعم: مركزك متاح على your-centre.dirassty.com، بشاشة دخول خاصة به.",
      },
      {
        question: "من يرى بيانات مركزي؟",
        answer: "حسابات مركزك فقط، كلٌّ حسب دوره: الإدارة والاستقبال والأساتذة والتلاميذ. كل مركز منفصل عن غيره.",
      },
      {
        question: "كيف يتوصّل أولياء الأمور بالوصولات والتنبيهات؟",
        answer: "عبر واتساب: يرسل الاستقبال الوصل أو تنبيه الغياب إلى رقم وليّ الأمر بنقرة واحدة.",
      },
      {
        question: "كيف أبدأ؟",
        answer: "اطلب عرضًا تجريبيًا عبر واتساب: نعرض عليك التطبيق ونجهّز مركزك معك.",
      },
    ],
  },
  cta: {
    title: "مستعد لتبسيط تسيير مركزك؟",
    text: "حدّثنا عن مركزك: نجيبك عبر واتساب.",
    button: "اطلب عرضًا تجريبيًا",
  },
  footer: {
    tagline: "تسيير مراكز الدعم واللغات والتكوين.",
    contact: "واتساب: 06 04 77 82 49",
    staffLogin: "دخول الفريق",
    studentLogin: "فضاء التلميذ",
    rights: "جميع الحقوق محفوظة.",
  },
  demo: {
    title: "اطلب عرضًا تجريبيًا",
    description: "اترك لنا معلوماتك: يُفتح طلبك في واتساب جاهزًا للإرسال.",
    name: "اسمك",
    center: "اسم المركز",
    city: "المدينة",
    phone: "الهاتف",
    optional: "اختياري",
    required: "هذا الحقل إلزامي.",
    submit: "إرسال عبر واتساب",
    cancel: "إلغاء",
    note: "يمكنك مراجعة الرسالة قبل إرسالها.",
    message: ({ name, center, city, phone }) =>
      [
        "مرحبًا، أرغب في عرض تجريبي لـ dirassty.",
        `الاسم: ${name}`,
        `المركز: ${center}`,
        city ? `المدينة: ${city}` : null,
        phone ? `الهاتف: ${phone}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
  },
};

export const VITRINE: Record<Locale, VitrineContent> = { fr, en, ar };

/** Lien WhatsApp de la demande de démo, message prérempli. */
export function demoWhatsAppUrl(message: string): string {
  return `https://wa.me/${DEMO_WHATSAPP}?text=${encodeURIComponent(message)}`;
}
