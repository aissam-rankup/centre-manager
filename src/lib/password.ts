/** Alphabet lisible : sans caractères ambigus (0/O, 1/l/I). */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

function randomFrom(alphabet: string, length: number): string {
  const values = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

/** Mot de passe provisoire lisible (création d'un compte de l'équipe). */
export function generatePassword(length = 12): string {
  return randomFrom(ALPHABET, length);
}

/**
 * Mot de passe temporaire d'une réinitialisation : 10 caractères lisibles,
 * au moins une lettre et un chiffre (politiques de l'authentification).
 */
export function generateTemporaryPassword(length = 10): string {
  for (;;) {
    const password = randomFrom(ALPHABET, length);
    if (/[A-Za-z]/.test(password) && /\d/.test(password)) return password;
  }
}

export type PasswordStrength = 0 | 1 | 2 | 3 | 4;

/** Robustesse indicative (affichage) : longueur et variété des caractères. */
export function passwordStrength(password: string): PasswordStrength {
  if (password.length < PASSWORD_MIN_LENGTH) return password.length === 0 ? 0 : 1;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  let score = 1;
  if (password.length >= 10) score++;
  if (password.length >= 14) score++;
  if (classes >= 3) score++;
  if (classes <= 1) score--;
  return Math.max(1, Math.min(4, score)) as PasswordStrength;
}
