/**
 * Vocabulaire configurable par type d'établissement (couche de présentation).
 *
 * Les libellés sont rédigés avec le vocabulaire par défaut (soutien scolaire :
 * élève, niveau, matière, professeur, séance). Pour un autre vocabulaire, chaque
 * forme du terme par défaut (article, élision, contraction, démonstratif,
 * « nouveau », accord) est remplacée par la même forme du terme du centre.
 */

export const VOCABULARY_KEYS = ["learner", "group", "course", "instructor", "session"] as const;
export type VocabularyKey = (typeof VOCABULARY_KEYS)[number];

export type Term = { singular: string; plural: string; gender: "m" | "f" };
export type VocabularyTerms = Record<VocabularyKey, Term>;

/** Soutien scolaire : vocabulaire dans lequel les libellés sont rédigés. */
export const DEFAULT_VOCABULARY: VocabularyTerms = {
  learner: { singular: "Élève", plural: "Élèves", gender: "m" },
  group: { singular: "Niveau", plural: "Niveaux", gender: "m" },
  course: { singular: "Matière", plural: "Matières", gender: "f" },
  instructor: { singular: "Professeur", plural: "Professeurs", gender: "m" },
  session: { singular: "Séance", plural: "Séances", gender: "f" },
};

const upper = (text: string) => text.charAt(0).toLocaleUpperCase("fr") + text.slice(1);
const lower = (text: string) => text.charAt(0).toLocaleLowerCase("fr") + text.slice(1);
/** Élision devant voyelle ou h muet : « l'élève », « cet apprenant ». */
const elides = (text: string) => /^[aeiouyhàâäéèêëîïôöùûü]/i.test(text);

/** Toutes les formes grammaticales d'un terme. */
export type Word = {
  one: string;
  One: string;
  many: string;
  Many: string;
  feminine: boolean;
  /** Accord : « e » au féminin. */
  e: string;
  a: string;
  A: string;
  the: string;
  The: string;
  theMany: string;
  TheMany: string;
  of: string;
  ofOne: string;
  ofMany: string;
  to: string;
  this: string;
  This: string;
  no: string;
  No: string;
  New: string;
  new: string;
  all: string;
  All: string;
};

export function word(term: Term): Word {
  const one = lower(term.singular.trim());
  const many = lower(term.plural.trim());
  const f = term.gender === "f";
  const v = elides(one);
  const the = v ? `l'${one}` : f ? `la ${one}` : `le ${one}`;
  const a = f ? `une ${one}` : `un ${one}`;
  const thisForm = f ? `cette ${one}` : v ? `cet ${one}` : `ce ${one}`;
  const no = f ? `aucune ${one}` : `aucun ${one}`;
  const newForm = f ? `nouvelle ${one}` : v ? `nouvel ${one}` : `nouveau ${one}`;
  const all = f ? `toutes les ${many}` : `tous les ${many}`;
  return {
    one,
    One: upper(one),
    many,
    Many: upper(many),
    feminine: f,
    e: f ? "e" : "",
    a,
    A: upper(a),
    the,
    The: upper(the),
    theMany: `les ${many}`,
    TheMany: `Les ${many}`,
    of: v ? `de l'${one}` : f ? `de la ${one}` : `du ${one}`,
    ofOne: v ? `d'${one}` : `de ${one}`,
    ofMany: `des ${many}`,
    to: v ? `à l'${one}` : f ? `à la ${one}` : `au ${one}`,
    this: thisForm,
    This: upper(thisForm),
    no,
    No: upper(no),
    New: upper(newForm),
    new: newForm,
    all,
    All: upper(all),
  };
}

export type Vocabulary = Record<VocabularyKey, Word>;

export function vocabulary(terms: VocabularyTerms): Vocabulary {
  return {
    learner: word(terms.learner),
    group: word(terms.group),
    course: word(terms.course),
    instructor: word(terms.instructor),
    session: word(terms.session),
  };
}

/** Formes remplacées, des plus longues aux plus courtes (« de la matière » avant « matière »). */
const FORMS: readonly (keyof Word)[] = [
  "All", "all", "New", "new", "of", "to", "This", "this", "No", "no", "A", "a", "The", "the",
  "TheMany", "theMany", "ofMany", "ofOne", "Many", "many", "One", "one",
];

/**
 * Accords courants d'un participe ou d'un adjectif placé après le terme
 * (« matière ajoutée », « séance annulée »). Clé : forme masculine.
 */
const AGREEMENTS = [
  "actif", "ajouté", "créé", "supprimé", "modifié", "enregistré", "inscrit", "absent", "présent", "affecté",
  "retiré", "archivé", "choisi", "sélectionné", "prévu", "annulé", "concerné", "suivi", "arrêté", "repris",
  "introuvable", "utilisé", "désactivé", "réactivé", "planifié", "reconduit",
] as const;

type Rule = { from: string; to: string };

function feminize(adjective: string): string {
  if (adjective.endsWith("if")) return `${adjective.slice(0, -2)}ive`;
  if (adjective.endsWith("e") && !adjective.endsWith("é")) return adjective;
  return `${adjective}e`;
}

function buildRules(target: VocabularyTerms): Rule[] {
  const rules: Rule[] = [];
  for (const key of VOCABULARY_KEYS) {
    const from = word(DEFAULT_VOCABULARY[key]);
    const to = word(target[key]);
    if (JSON.stringify(DEFAULT_VOCABULARY[key]) === JSON.stringify(target[key])) continue;

    // Accords : « matière ajoutée » → « module ajouté ».
    if (from.feminine !== to.feminine) {
      for (const adjective of AGREEMENTS) {
        const fromAdj = from.feminine ? feminize(adjective) : adjective;
        const toAdj = to.feminine ? feminize(adjective) : adjective;
        for (const [a, b] of [
          [from.one, to.one],
          [from.One, to.One],
        ] as const) {
          rules.push({ from: `${a} ${fromAdj}`, to: `${b} ${toAdj}` });
        }
        for (const [a, b] of [
          [from.many, to.many],
          [from.Many, to.Many],
        ] as const) {
          rules.push({ from: `${a} ${fromAdj}s`, to: `${b} ${toAdj}s` });
        }
        // Accord à distance : « la matière a été ajoutée », « cette séance est annulée ».
        for (const form of ["the", "The", "this", "This", "a", "A", "no", "No"] as const) {
          for (const verb of ["a été", "est", "sera", "n'est pas", "n'a pas été"]) {
            rules.push({ from: `${from[form]} ${verb} ${fromAdj}`, to: `${to[form]} ${verb} ${toAdj}` });
          }
        }
        for (const form of ["theMany", "TheMany", "many", "Many"] as const) {
          for (const verb of ["ont été", "sont", "seront"]) {
            rules.push({ from: `${from[form]} ${verb} ${fromAdj}s`, to: `${to[form]} ${verb} ${toAdj}s` });
          }
        }
      }
    }
    for (const form of FORMS) {
      const a = from[form];
      const b = to[form];
      if (typeof a === "string" && typeof b === "string" && a !== b) rules.push({ from: a, to: b });
    }
  }
  return rules.sort((x, y) => y.from.length - x.from.length);
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type Translator = (text: string) => string;

const translators = new Map<string, Translator>();

/** Fonction de résolution du vocabulaire : texte rédigé par défaut → vocabulaire du centre. */
export function translator(terms: VocabularyTerms): Translator {
  const key = JSON.stringify(terms);
  const cached = translators.get(key);
  if (cached) return cached;

  const rules = buildRules(terms);
  let translate: Translator = (text) => text;
  if (rules.length > 0) {
    const map = new Map(rules.map((rule) => [rule.from, rule.to]));
    // Mots entiers uniquement (lettres Unicode, apostrophe incluse dans le motif).
    const pattern = new RegExp(`(?<![\\p{L}])(${rules.map((rule) => escape(rule.from)).join("|")})(?![\\p{L}])`, "gu");
    translate = (text) => text.replace(pattern, (match) => map.get(match) ?? match);
  }
  translators.set(key, translate);
  return translate;
}

type Deep<T> = T;

/** Applique le vocabulaire à tout un arbre de libellés (chaînes et fonctions renvoyant du texte). */
export function translateTree<T>(tree: Deep<T>, translate: Translator): T {
  const visit = (value: unknown): unknown => {
    if (typeof value === "string") return translate(value);
    if (typeof value === "function") {
      const fn = value as (...args: unknown[]) => unknown;
      return (...args: unknown[]) => visit(fn(...args));
    }
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, visit(v)]));
    }
    return value;
  };
  return visit(tree) as T;
}

/** Vocabulaire du centre : termes du type d'établissement, surchargés par les termes personnalisés. */
export function parseVocabularyTerms(value: unknown): VocabularyTerms {
  const result: VocabularyTerms = { ...DEFAULT_VOCABULARY };
  if (!value || typeof value !== "object") return result;
  for (const key of VOCABULARY_KEYS) {
    const term: unknown = (value as Record<string, unknown>)[key];
    if (!term || typeof term !== "object") continue;
    const { singular, plural, gender } = term as Record<string, unknown>;
    if (typeof singular === "string" && typeof plural === "string" && (gender === "m" || gender === "f") && singular && plural) {
      result[key] = { singular, plural, gender };
    }
  }
  return result;
}
