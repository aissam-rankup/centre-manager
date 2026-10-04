/**
 * Identifiant de connexion d'un élève : code de 8 caractères fourni par le
 * centre (sans 0, O, 1, I ni L, faciles à confondre), affiché « 7K4Q 2MXP ».
 * Le compte Auth porte une adresse technique dérivée du code, jamais une
 * donnée personnelle de l'élève.
 */

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const LOGIN_CODE_PATTERN = /^[A-Z0-9]{8}$/;

function randomString(alphabet: string, length: number): string {
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

export function generateLoginCode(): string {
  return randomString(CODE_ALPHABET, 8);
}

/** Mot de passe initial : 10 caractères, minuscules et chiffres (lisible au téléphone). */
export function generateStudentPassword(): string {
  // Au moins une lettre et un chiffre (politiques de mot de passe de l'authentification).
  for (;;) {
    const password = randomString(PASSWORD_ALPHABET, 10);
    if (/[a-z]/.test(password) && /\d/.test(password)) return password;
  }
}

/** Saisie de l'élève : majuscules, sans espace ni tiret. */
export function normalizeLoginCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** « 7K4Q2MXP » → « 7K4Q 2MXP » */
export function formatLoginCode(code: string): string {
  return `${code.slice(0, 4)} ${code.slice(4)}`;
}

/** Adresse technique du compte Auth d'un élève (domaine réservé, non routable). */
export function studentAuthEmail(code: string): string {
  return `eleve-${code.toLowerCase()}@eleves.centromanager.invalid`;
}
