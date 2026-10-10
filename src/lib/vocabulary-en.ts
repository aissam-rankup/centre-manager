/**
 * Vocabulaire en anglais : les libellés anglais écrivent les termes métier avec
 * des marqueurs ({learner}, {Learners}, {a session}, {A course}…), remplacés par
 * l'équivalent anglais des termes du centre. Un terme personnalisé sans
 * équivalent connu prend le terme anglais par défaut.
 */

import { DEFAULT_VOCABULARY, type Translator, VOCABULARY_KEYS, type VocabularyKey, type VocabularyTerms } from "@/lib/vocabulary";

type EnglishTerm = { singular: string; plural: string };

/** Soutien scolaire, en anglais. */
export const DEFAULT_ENGLISH_VOCABULARY: Record<VocabularyKey, EnglishTerm> = {
  learner: { singular: "student", plural: "students" },
  group: { singular: "level", plural: "levels" },
  course: { singular: "subject", plural: "subjects" },
  instructor: { singular: "teacher", plural: "teachers" },
  session: { singular: "class", plural: "classes" },
};

/** Termes des types d'établissement (center_types) et leur équivalent anglais, par clé. */
const KNOWN: Record<VocabularyKey, Record<string, EnglishTerm>> = {
  learner: {
    "élève": DEFAULT_ENGLISH_VOCABULARY.learner,
    stagiaire: { singular: "trainee", plural: "trainees" },
    apprenant: { singular: "learner", plural: "learners" },
    candidat: { singular: "candidate", plural: "candidates" },
    "étudiant": { singular: "student", plural: "students" },
  },
  group: {
    niveau: DEFAULT_ENGLISH_VOCABULARY.group,
    promotion: { singular: "cohort", plural: "cohorts" },
    "groupe de niveau": { singular: "level group", plural: "level groups" },
    "catégorie de permis": { singular: "licence category", plural: "licence categories" },
    "filière": { singular: "programme", plural: "programmes" },
    groupe: { singular: "group", plural: "groups" },
  },
  course: {
    "matière": DEFAULT_ENGLISH_VOCABULARY.course,
    module: { singular: "module", plural: "modules" },
    langue: { singular: "language", plural: "languages" },
    "type de leçon": { singular: "lesson type", plural: "lesson types" },
    "unité d'enseignement": { singular: "course unit", plural: "course units" },
    cours: { singular: "course", plural: "courses" },
  },
  instructor: {
    professeur: DEFAULT_ENGLISH_VOCABULARY.instructor,
    formateur: { singular: "trainer", plural: "trainers" },
    enseignant: { singular: "teacher", plural: "teachers" },
    moniteur: { singular: "instructor", plural: "instructors" },
    "chargé de td": { singular: "tutor", plural: "tutors" },
    encadrant: { singular: "supervisor", plural: "supervisors" },
  },
  session: {
    "séance": DEFAULT_ENGLISH_VOCABULARY.session,
    session: { singular: "session", plural: "sessions" },
    cours: { singular: "class", plural: "classes" },
    "leçon": { singular: "lesson", plural: "lessons" },
  },
};

/** Équivalent anglais des termes d'un centre. */
export function englishTerms(terms: VocabularyTerms): Record<VocabularyKey, EnglishTerm> {
  const result = { ...DEFAULT_ENGLISH_VOCABULARY };
  for (const key of VOCABULARY_KEYS) {
    if (JSON.stringify(terms[key]) === JSON.stringify(DEFAULT_VOCABULARY[key])) continue;
    const known = KNOWN[key][terms[key].singular.trim().toLocaleLowerCase("fr").replaceAll("’", "'")];
    if (known) result[key] = known;
  }
  return result;
}

const MARKER_KEYS: Record<string, VocabularyKey> = {
  learner: "learner",
  group: "group",
  course: "course",
  instructor: "instructor",
  session: "session",
};

/** {learner} {learners} {Learner} {Learners} {a learner} {A learner}, idem pour chaque clé. */
const MARKER = /\{(a |A )?([Ll]earner|[Gg]roup|[Cc]ourse|[Ii]nstructor|[Ss]ession)(s)?\}/g;

const upper = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const translators = new Map<string, Translator>();

/** Remplace les marqueurs des libellés anglais par les termes du centre. */
export function englishTranslator(terms: VocabularyTerms): Translator {
  const key = JSON.stringify(terms);
  const cached = translators.get(key);
  if (cached) return cached;
  const english = englishTerms(terms);
  const translate: Translator = (text) =>
    text.replace(MARKER, (_match, article: string | undefined, name: string, plural: string | undefined) => {
      const term = english[MARKER_KEYS[name.toLowerCase()] ?? "learner"];
      let value = plural ? term.plural : term.singular;
      if (article) value = `${/^[aeiou]/i.test(value) ? "an" : "a"} ${value}`;
      const capital = article ? article.startsWith("A") : name.charAt(0) === name.charAt(0).toUpperCase();
      return capital ? upper(value) : value;
    });
  translators.set(key, translate);
  return translate;
}
