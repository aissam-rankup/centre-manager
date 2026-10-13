import type { Locale } from "@/lib/i18n/locale";

/**
 * Montant en toutes lettres (reçus de paie) : « Deux mille cinq cents dirhams »,
 * « Two thousand five hundred dirhams », « ألفان وخمسمائة درهم ».
 * Valeur absolue (un reçu d'annulation porte son signe ailleurs) ; centimes
 * ajoutés s'il y en a ; jusqu'à 999 999 999,99.
 */
export function amountInWords(amount: number, locale: Locale): string {
  const cents = Math.round(Math.abs(amount) * 100);
  const whole = Math.floor(cents / 100);
  const fraction = cents % 100;
  if (locale === "ar") return arabic(whole, fraction);
  if (locale === "en") return capitalize(english(whole, fraction));
  return capitalize(french(whole, fraction));
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// ---------------------------------------------------------------------
// Français (orthographe traditionnelle : « quatre-vingts », « deux cents »)
// ---------------------------------------------------------------------
const FR_UNITS = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf",
];
const FR_TENS = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

/** 0 à 99 ; `final` : le nombre termine l'expression (« quatre-vingts » prend alors un s). */
function frBelow100(n: number, final: boolean): string {
  if (n < 20) return FR_UNITS[n];
  if (n < 70) {
    const tens = Math.floor(n / 10);
    const unit = n % 10;
    if (unit === 0) return FR_TENS[tens];
    return unit === 1 ? `${FR_TENS[tens]} et un` : `${FR_TENS[tens]}-${FR_UNITS[unit]}`;
  }
  if (n < 80) return n === 71 ? "soixante et onze" : `soixante-${FR_UNITS[n - 60]}`;
  if (n === 80) return final ? "quatre-vingts" : "quatre-vingt";
  return `quatre-vingt-${FR_UNITS[n - 80]}`;
}

/** 0 à 999. */
function frBelow1000(n: number, final: boolean): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds === 0) return frBelow100(rest, final);
  const head = hundreds === 1 ? "cent" : `${FR_UNITS[hundreds]} ${rest === 0 && final ? "cents" : "cent"}`;
  return rest === 0 ? head : `${head} ${frBelow100(rest, final)}`;
}

function frInteger(n: number): string {
  if (n === 0) return "zéro";
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions > 0) parts.push(`${frBelow1000(millions, true)} ${millions > 1 ? "millions" : "million"}`);
  if (thousands > 0) parts.push(thousands === 1 ? "mille" : `${frBelow1000(thousands, false)} mille`);
  if (rest > 0) parts.push(frBelow1000(rest, true));
  return parts.join(" ");
}

function french(whole: number, fraction: number): string {
  // « un million de dirhams » : « de » après million(s) sans rien derrière.
  const roundMillion = whole >= 1_000_000 && whole % 1_000_000 === 0;
  const unit = `${roundMillion ? "de " : ""}${whole > 1 ? "dirhams" : "dirham"}`;
  const main = `${frInteger(whole)} ${unit}`;
  if (fraction === 0) return main;
  return `${main} et ${frInteger(fraction)} ${fraction > 1 ? "centimes" : "centime"}`;
}

// ---------------------------------------------------------------------
// Anglais
// ---------------------------------------------------------------------
const EN_UNITS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function enBelow1000(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds > 0) parts.push(`${EN_UNITS[hundreds]} hundred`);
  if (rest > 0) {
    if (rest < 20) parts.push(EN_UNITS[rest]);
    else parts.push(rest % 10 === 0 ? EN_TENS[rest / 10] : `${EN_TENS[Math.floor(rest / 10)]}-${EN_UNITS[rest % 10]}`);
  }
  return parts.join(" ");
}

function enInteger(n: number): string {
  if (n === 0) return "zero";
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions > 0) parts.push(`${enBelow1000(millions)} million`);
  if (thousands > 0) parts.push(`${enBelow1000(thousands)} thousand`);
  if (rest > 0) parts.push(enBelow1000(rest));
  return parts.join(" ");
}

function english(whole: number, fraction: number): string {
  const main = `${enInteger(whole)} ${whole === 1 ? "dirham" : "dirhams"}`;
  if (fraction === 0) return main;
  return `${main} and ${enInteger(fraction)} ${fraction === 1 ? "centime" : "centimes"}`;
}

// ---------------------------------------------------------------------
// Arabe (usage des reçus : « ... درهم », composantes reliées par « و »)
// ---------------------------------------------------------------------
const AR_UNITS = ["صفر", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة"];
const AR_TEENS = ["", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const AR_TENS = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const AR_HUNDREDS = ["", "مائة", "مئتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

function arBelow100(n: number): string {
  if (n <= 10) return AR_UNITS[n];
  if (n < 20) return AR_TEENS[n - 10];
  const unit = n % 10;
  const tens = AR_TENS[Math.floor(n / 10)];
  return unit === 0 ? tens : `${AR_UNITS[unit]} و${tens}`;
}

function arBelow1000(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds > 0) parts.push(AR_HUNDREDS[hundreds]);
  if (rest > 0) parts.push(arBelow100(rest));
  return parts.join(" و");
}

/** Groupe (milliers, millions) : 1 « ألف », 2 « ألفان », 3 à 10 « ثلاثة آلاف », au-delà « أحد عشر ألف ». */
function arScale(n: number, one: string, two: string, plural: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n <= 10) return `${AR_UNITS[n]} ${plural}`;
  return `${arBelow1000(n)} ${one}`;
}

function arInteger(n: number): string {
  if (n === 0) return AR_UNITS[0];
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions > 0) parts.push(arScale(millions, "مليون", "مليونان", "ملايين"));
  if (thousands > 0) parts.push(arScale(thousands, "ألف", "ألفان", "آلاف"));
  if (rest > 0) parts.push(arBelow1000(rest));
  return parts.join(" و");
}

function arabic(whole: number, fraction: number): string {
  const main = `${arInteger(whole)} درهم`;
  if (fraction === 0) return main;
  return `${main} و${arInteger(fraction)} سنتيم`;
}
