/** Mot de passe provisoire lisible : sans caractères ambigus (0/O, 1/l/I). */
export function generatePassword(length = 12): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const values = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}
