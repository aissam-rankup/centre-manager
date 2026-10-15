import { describe, expect, it } from "vitest";

import { generateTemporaryPassword, passwordStrength } from "@/lib/password";
import { myPasswordSchema, resetPasswordSchema } from "@/lib/validation/password";

describe("mot de passe temporaire", () => {
  it("10 caractères lisibles, au moins une lettre et un chiffre", () => {
    for (let i = 0; i < 500; i++) {
      const password = generateTemporaryPassword();
      expect(password).toHaveLength(10);
      expect(password).toMatch(/[A-Za-z]/);
      expect(password).toMatch(/\d/);
      // Sans caractères ambigus.
      expect(password).not.toMatch(/[0O1lI]/);
    }
  });

  it("change à chaque génération", () => {
    const values = new Set(Array.from({ length: 50 }, () => generateTemporaryPassword()));
    expect(values.size).toBe(50);
  });
});

describe("robustesse", () => {
  it("trop court : faible ; long et varié : excellent", () => {
    expect(passwordStrength("")).toBe(0);
    expect(passwordStrength("abc")).toBe(1);
    expect(passwordStrength("abcdefgh")).toBe(1);
    expect(passwordStrength("Abcdef12")).toBe(2);
    expect(passwordStrength("Abcdef12!xyzW9")).toBe(4);
  });
});

describe("validation", () => {
  it("réinitialisation : une seule cible, 8 caractères au moins si saisi", () => {
    const id = "a1100000-0000-4000-8000-00000000000c";
    expect(resetPasswordSchema.safeParse({ userId: id, mode: "generate" }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ userId: id, studentId: id, mode: "generate" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ mode: "generate" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ userId: id, mode: "manual", password: "court" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ userId: id, mode: "manual", password: "assez-long" }).success).toBe(true);
  });

  it("« Mon mot de passe » : confirmation identique, nouveau différent de l'actuel", () => {
    expect(myPasswordSchema.safeParse({ current: "ancien-mdp", next: "nouveau-mdp", confirm: "nouveau-mdp" }).success).toBe(true);
    expect(myPasswordSchema.safeParse({ current: "ancien-mdp", next: "nouveau-mdp", confirm: "autre-mdp" }).success).toBe(false);
    expect(myPasswordSchema.safeParse({ current: "meme-mdp-1", next: "meme-mdp-1", confirm: "meme-mdp-1" }).success).toBe(false);
  });
});
