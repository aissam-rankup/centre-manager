/**
 * Vocabulaire en arabe : les libellés arabes écrivent les termes métier avec des
 * marqueurs ({learner}, {learners}, {the learner}, {the learners}…), remplacés par
 * l'équivalent arabe des termes du centre. Un terme personnalisé sans équivalent
 * connu prend le terme arabe par défaut.
 */

import { DEFAULT_VOCABULARY, type Translator, VOCABULARY_KEYS, type VocabularyKey, type VocabularyTerms } from "@/lib/vocabulary";

/** Formes indéfinies et définies (avec « ال »), au singulier et au pluriel. */
type ArabicTerm = { singular: string; plural: string; definite: string; definitePlural: string };

/** Termes simples : la forme définie ajoute « ال ». */
const simple = (singular: string, plural: string): ArabicTerm => ({
  singular,
  plural,
  definite: `ال${singular}`,
  definitePlural: `ال${plural}`,
});

/** Soutien scolaire, en arabe. */
export const DEFAULT_ARABIC_VOCABULARY: Record<VocabularyKey, ArabicTerm> = {
  learner: simple("تلميذ", "تلاميذ"),
  group: simple("مستوى", "مستويات"),
  course: simple("مادة", "مواد"),
  instructor: simple("أستاذ", "أساتذة"),
  session: simple("حصة", "حصص"),
};

/** Termes des types d'établissement (center_types) et leur équivalent arabe, par clé. */
const KNOWN: Record<VocabularyKey, Record<string, ArabicTerm>> = {
  learner: {
    "élève": DEFAULT_ARABIC_VOCABULARY.learner,
    stagiaire: simple("متدرب", "متدربون"),
    apprenant: simple("متعلم", "متعلمون"),
    candidat: simple("مترشح", "مترشحون"),
    "étudiant": simple("طالب", "طلبة"),
  },
  group: {
    niveau: DEFAULT_ARABIC_VOCABULARY.group,
    promotion: simple("فوج", "أفواج"),
    "groupe de niveau": {
      singular: "مجموعة مستوى",
      plural: "مجموعات مستوى",
      definite: "مجموعة المستوى",
      definitePlural: "مجموعات المستوى",
    },
    "catégorie de permis": {
      singular: "صنف رخصة",
      plural: "أصناف رخص",
      definite: "صنف الرخصة",
      definitePlural: "أصناف الرخص",
    },
    "filière": simple("شعبة", "شعب"),
    groupe: simple("مجموعة", "مجموعات"),
  },
  course: {
    "matière": DEFAULT_ARABIC_VOCABULARY.course,
    module: simple("وحدة", "وحدات"),
    langue: simple("لغة", "لغات"),
    "type de leçon": {
      singular: "نوع درس",
      plural: "أنواع دروس",
      definite: "نوع الدرس",
      definitePlural: "أنواع الدروس",
    },
    "unité d'enseignement": {
      singular: "وحدة دراسية",
      plural: "وحدات دراسية",
      definite: "الوحدة الدراسية",
      definitePlural: "الوحدات الدراسية",
    },
    cours: simple("درس", "دروس"),
  },
  instructor: {
    professeur: DEFAULT_ARABIC_VOCABULARY.instructor,
    formateur: simple("مكوّن", "مكوّنون"),
    enseignant: simple("مدرّس", "مدرّسون"),
    moniteur: simple("مدرب", "مدربون"),
    "chargé de td": simple("مؤطر", "مؤطرون"),
    encadrant: simple("مؤطر", "مؤطرون"),
  },
  session: {
    "séance": DEFAULT_ARABIC_VOCABULARY.session,
    session: simple("جلسة", "جلسات"),
    cours: simple("درس", "دروس"),
    "leçon": simple("درس", "دروس"),
  },
};

/** Équivalent arabe des termes d'un centre. */
export function arabicTerms(terms: VocabularyTerms): Record<VocabularyKey, ArabicTerm> {
  const result = { ...DEFAULT_ARABIC_VOCABULARY };
  for (const key of VOCABULARY_KEYS) {
    if (JSON.stringify(terms[key]) === JSON.stringify(DEFAULT_VOCABULARY[key])) continue;
    const known = KNOWN[key][terms[key].singular.trim().toLocaleLowerCase("fr").replaceAll("’", "'")];
    if (known) result[key] = known;
  }
  return result;
}

/**
 * {learner} {learners} {the learner} {the learners}, idem pour chaque clé.
 * Un « ل » collé avant une forme définie donne « لل » (للتلميذ).
 */
const MARKER = /(ل?)\{(the )?(learner|group|course|instructor|session)(s)?\}/g;

const translators = new Map<string, Translator>();

/** Remplace les marqueurs des libellés arabes par les termes du centre. */
export function arabicTranslator(terms: VocabularyTerms): Translator {
  const key = JSON.stringify(terms);
  const cached = translators.get(key);
  if (cached) return cached;
  const arabic = arabicTerms(terms);
  const translate: Translator = (text) =>
    text.replace(MARKER, (_match, lam: string, definite: string | undefined, name: VocabularyKey, plural: string | undefined) => {
      const term = arabic[name];
      const value = definite ? (plural ? term.definitePlural : term.definite) : plural ? term.plural : term.singular;
      // « ل » + « ال » → « لل » ; sinon le préfixe est simplement collé.
      if (lam && value.startsWith("ال")) return `ل${value.slice(1)}`;
      return `${lam}${value}`;
    });
  translators.set(key, translate);
  return translate;
}
