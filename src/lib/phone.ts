/**
 * Numéros de téléphone marocains.
 * Formats acceptés : « 06 12 34 56 78 », « 0612345678 », « +212 6 12 34 56 78 », « 00212… ».
 */

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Numéro national à 10 chiffres (« 0612345678 »), ou null si le format est invalide. */
export function toNationalNumber(value: string): string | null {
  let digits = digitsOnly(value);
  if (digits.startsWith("00212")) digits = `0${digits.slice(5)}`;
  else if (digits.startsWith("212")) digits = `0${digits.slice(3)}`;
  return /^0[5-7]\d{8}$/.test(digits) ? digits : null;
}

export function isValidPhone(value: string): boolean {
  return toNationalNumber(value) !== null;
}

/** « 06 12 34 56 78 » */
export function formatPhone(value: string): string {
  const national = toNationalNumber(value);
  if (!national) return value;
  return national.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}

/** Lien « tel: » au format international. */
export function toTelHref(value: string): string | null {
  const national = toNationalNumber(value);
  return national ? `tel:+212${national.slice(1)}` : null;
}

/** Lien de discussion WhatsApp. */
export function toWhatsAppHref(value: string): string | null {
  const national = toNationalNumber(value);
  return national ? `https://wa.me/212${national.slice(1)}` : null;
}
