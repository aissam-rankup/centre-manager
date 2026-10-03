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

function replaceAll(text: string, from: string, to: string): string {
  return from === to ? text : text.split(from).join(to);
}

/** Message final : chaque variable, dans l'une ou l'autre forme, remplacée par sa valeur. */
export function fillTemplate<K extends string>(
  template: string,
  tokens: Tokens<K>,
  canonical: Tokens<K>,
  values: Record<K, string>,
): string {
  let message = template;
  for (const key of Object.keys(tokens) as K[]) {
    message = message.split(tokens[key]).join(values[key]);
    message = message.split(canonical[key]).join(values[key]);
  }
  return message;
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
