/**
 * Variables des modèles de message ([élève], [montant]…).
 *
 * Elles s'affichent dans le vocabulaire du centre ([stagiaire] pour un
 * centre de formation), mais un modèle s'enregistre avec leur forme
 * d'origine : il reste valable si le centre change de vocabulaire. Au
 * moment d'écrire le message, les deux formes sont remplacées (un modèle
 * enregistré avant cette règle garde la forme de son vocabulaire).
 */

type Tokens<K extends string> = Record<K, string>;

/** Longueur maximale d'un modèle, vérifiée sur sa forme enregistrée (celle que la base contrôle). */
export const TEMPLATE_MAX_LENGTH = 1000;

function replaceAll(text: string, from: string, to: string): string {
  return from === to ? text : text.split(from).join(to);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Message final : chaque variable, dans l'une ou l'autre forme, remplacée
 * par sa valeur, en un seul passage (une valeur insérée n'est jamais relue :
 * un nom contenant « [élève] » reste tel quel).
 */
export function fillTemplate<K extends string>(
  template: string,
  tokens: Tokens<K>,
  canonical: Tokens<K>,
  values: Record<K, string>,
): string {
  const keyOf = new Map<string, K>();
  for (const key of Object.keys(tokens) as K[]) keyOf.set(tokens[key], key);
  for (const key of Object.keys(canonical) as K[]) if (!keyOf.has(canonical[key])) keyOf.set(canonical[key], key);
  const forms = [...keyOf.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  if (forms.length === 0) return template;
  return template.replace(new RegExp(forms.join("|"), "g"), (match) => {
    const key = keyOf.get(match);
    return key === undefined ? match : values[key];
  });
}

/** Modèle à enregistrer : variables du vocabulaire du centre → forme d'origine. */
export function toCanonicalTokens<K extends string>(template: string, tokens: Tokens<K>, canonical: Tokens<K>): string {
  let text = template;
  for (const key of Object.keys(tokens) as K[]) text = replaceAll(text, tokens[key], canonical[key]);
  return text;
}

/** Modèle à afficher : variables d'origine → vocabulaire du centre. */
export function fromCanonicalTokens<K extends string>(template: string, tokens: Tokens<K>, canonical: Tokens<K>): string {
  let text = template;
  for (const key of Object.keys(tokens) as K[]) text = replaceAll(text, canonical[key], tokens[key]);
  return text;
}
