/**
 * Redirection relative (en-tête Location sans hôte) : le navigateur la résout
 * sur l'adresse qu'il visite (domaine racine ou sous-domaine du centre).
 * Derrière l'hébergeur, l'adresse vue par une route serveur est l'adresse
 * interne (0.0.0.0:3000) : jamais d'URL absolue construite depuis la requête.
 */
export function relativeRedirect(path: string, status: 302 | 303 | 307 = 307): Response {
  return new Response(null, { status, headers: { Location: path, "Cache-Control": "no-store" } });
}
