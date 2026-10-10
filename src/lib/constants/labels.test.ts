import { describe, expect, it } from "vitest";

import { labelsFor, LABELS, messageTranslator } from "@/lib/constants/labels";
import { DEFAULT_VOCABULARY, type VocabularyTerms } from "@/lib/vocabulary";
import { arabicTranslator } from "@/lib/vocabulary-ar";
import { englishTranslator } from "@/lib/vocabulary-en";

const TRAINING: VocabularyTerms = {
  learner: { singular: "Stagiaire", plural: "Stagiaires", gender: "m" },
  group: { singular: "Promotion", plural: "Promotions", gender: "f" },
  course: { singular: "Module", plural: "Modules", gender: "m" },
  instructor: { singular: "Formateur", plural: "Formateurs", gender: "m" },
  session: { singular: "Session", plural: "Sessions", gender: "f" },
};

/** Toutes les chaînes d'un arbre de libellés, avec leur chemin (fonctions exclues). */
function strings(tree: unknown, path = ""): [string, string][] {
  if (typeof tree === "string") return [[path, tree]];
  if (!tree || typeof tree !== "object") return [];
  return Object.entries(tree).flatMap(([key, value]) => strings(value, path ? `${path}.${key}` : key));
}

function at(tree: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], tree);
}

describe("englishTranslator", () => {
  it("remplace les marqueurs par les termes anglais du centre", () => {
    const t = englishTranslator(DEFAULT_VOCABULARY);
    expect(t("New {learner}")).toBe("New student");
    expect(t("{Groups} and {courses}")).toBe("Levels and subjects");
    expect(t("Today's {sessions}")).toBe("Today's classes");
    expect(t("{A instructor} is absent")).toBe("A teacher is absent");
  });

  it("calcule l'article et suit le vocabulaire du type d'établissement", () => {
    const t = englishTranslator(TRAINING);
    expect(t("Search for {a learner}")).toBe("Search for a trainee");
    expect(t("{Instructors}")).toBe("Trainers");
    expect(t("{a course}")).toBe("a module");
    const language = englishTranslator({ ...DEFAULT_VOCABULARY, learner: { singular: "Apprenant", plural: "Apprenants", gender: "m" } });
    expect(language("{A learner}")).toBe("A learner");
    expect(language("{a learner}")).toBe("a learner");
  });

  it("garde le terme anglais par défaut pour un terme personnalisé inconnu", () => {
    const t = englishTranslator({ ...DEFAULT_VOCABULARY, learner: { singular: "Adhérent", plural: "Adhérents", gender: "m" } });
    expect(t("{Learners}")).toBe("Students");
  });
});

describe("libellés anglais", () => {
  const french = labelsFor(DEFAULT_VOCABULARY);
  const english = labelsFor(TRAINING, null, "en");

  it("ont la même structure que les libellés français", () => {
    const keys = (tree: unknown): string[] => strings(tree).map(([path]) => path).sort();
    expect(keys(english)).toEqual(keys(french));
  });

  it("ne laissent aucun marqueur de vocabulaire non remplacé", () => {
    const leftovers = strings(english).filter(([, text]) => /\{(a |A )?[A-Za-z]+\}/.test(text) && !/\[[^\]]+\]/.test(text));
    expect(leftovers).toEqual([]);
  });

  it("gardent en français les modèles de messages envoyés aux familles", () => {
    const frenchTraining = labelsFor(TRAINING);
    for (const path of ["receipts.whatsappTemplate", "receipts.tokens", "reenrollment.reminders.templates", "absenceAlerts.template", "centerSettings.sample"]) {
      expect(at(english, path)).toEqual(at(frenchTraining, path));
    }
  });

  it("sont bien en anglais (échantillon)", () => {
    expect(english.common.cancel).toBe("Cancel");
    expect(english.nav.newStudent).toBe("New trainee");
    expect(english.days).toHaveLength(7);
  });
});

describe("arabicTranslator", () => {
  it("remplace les marqueurs par les formes arabes (indéfinies, définies, pluriel)", () => {
    const t = arabicTranslator(DEFAULT_VOCABULARY);
    expect(t("إضافة {learner}")).toBe("إضافة تلميذ");
    expect(t("{the learners} و{the courses}")).toBe("التلاميذ والمواد");
    expect(t("ملف {the learner}")).toBe("ملف التلميذ");
  });

  it("contracte « ل » + « ال » et suit le vocabulaire du type d'établissement", () => {
    expect(arabicTranslator(DEFAULT_VOCABULARY)("ل{the learner}")).toBe("للتلميذ");
    const t = arabicTranslator(TRAINING);
    expect(t("{the learners}")).toBe("المتدربون");
    expect(t("{instructors}")).toBe("مكوّنون");
    expect(t("ل{learner}")).toBe("لمتدرب");
  });
});

describe("libellés arabes", () => {
  const french = labelsFor(DEFAULT_VOCABULARY);
  const arabic = labelsFor(TRAINING, null, "ar");

  it("ont la même structure que les libellés français", () => {
    const keys = (tree: unknown): string[] => strings(tree).map(([path]) => path).sort();
    expect(keys(arabic)).toEqual(keys(french));
  });

  it("ne laissent aucun marqueur de vocabulaire non remplacé", () => {
    const leftovers = strings(arabic).filter(([, text]) => /\{(the |a |A )?[A-Za-z]+\}/.test(text));
    expect(leftovers).toEqual([]);
  });

  it("gardent en français les modèles de messages envoyés aux familles", () => {
    const frenchTraining = labelsFor(TRAINING);
    for (const path of ["receipts.whatsappTemplate", "reenrollment.reminders.templates", "absenceAlerts.template", "centerSettings.sample"]) {
      expect(at(arabic, path)).toEqual(at(frenchTraining, path));
    }
  });

  it("sont en arabe (échantillon)", () => {
    expect(arabic.days).toHaveLength(7);
    expect(arabic.common.colon).toBe(":");
    expect(arabic.common.cancel).toMatch(/[؀-ۿ]/);
  });
});

describe("messageTranslator", () => {
  it("traduit un message français connu et laisse le reste tel quel", () => {
    const t = messageTranslator(DEFAULT_VOCABULARY, null, "en");
    expect(t(LABELS.actions.errors.invalid)).not.toBe(LABELS.actions.errors.invalid);
    expect(t("Message de la base")).toBe("Message de la base");
    expect(messageTranslator(DEFAULT_VOCABULARY, null, "fr")(LABELS.actions.errors.invalid)).toBe(LABELS.actions.errors.invalid);
  });
});
