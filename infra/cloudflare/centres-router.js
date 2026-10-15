/**
 * Worker Cloudflare « centres-router » — route : *.dirassty.com/*
 *
 * Relaie <slug>.dirassty.com vers l'application (https://dirassty.com) :
 *  - en-têtes X-Center-Slug, X-Forwarded-Host et X-Proxy-Secret (secret
 *    PROXY_SECRET du Worker, identique à celui de l'hébergeur) ;
 *  - redirections réécrites vers l'adresse du centre ;
 *  - cookies sans attribut Domain (aucune session partagée entre centres) ;
 *  - www.dirassty.com → dirassty.com (301).
 *
 * Fichiers statiques de l'application (/_next/static/, images, polices) :
 * gardés en cache par Cloudflare, sous une seule clé pour tous les centres.
 * Ils ne sont demandés qu'une fois à l'hébergeur au lieu d'une fois par page
 * et par visiteur : le CDN de l'hébergeur, qui voit tout le trafic arriver
 * de quelques adresses Cloudflare, ne déclenche plus sa limite (erreur 429).
 *
 * Variables du Worker : PROXY_SECRET (secret, obligatoire), ROOT_DOMAIN
 * (facultatif, « dirassty.com » par défaut).
 */

const STATIC_PATH = /^\/(?:_next\/static\/|favicon\.ico$)|\.(?:svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|css|js|map)$/i;
const ONE_YEAR = 31536000;

export default {
  async fetch(request, env, ctx) {
    const rootDomain = (env.ROOT_DOMAIN || "dirassty.com").toLowerCase();
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();

    if (host === `www.${rootDomain}`) {
      return Response.redirect(`https://${rootDomain}${url.pathname}${url.search}`, 301);
    }
    if (!host.endsWith(`.${rootDomain}`)) {
      return fetch(request);
    }
    const slug = host.slice(0, -rootDomain.length - 1);

    const upstream = new URL(url.pathname + url.search, `https://${rootDomain}`);

    // Fichiers statiques : identiques pour tous les centres, servis depuis le cache Cloudflare.
    if ((request.method === "GET" || request.method === "HEAD") && STATIC_PATH.test(url.pathname)) {
      return serveStatic(request, upstream, ctx);
    }

    const headers = new Headers(request.headers);
    headers.set("X-Center-Slug", slug);
    headers.set("X-Forwarded-Host", host);
    headers.set("X-Proxy-Secret", env.PROXY_SECRET || "");
    headers.delete("host");

    const response = await fetch(upstream.toString(), {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });
    return rewriteResponse(response, host, rootDomain);
  },
};

async function serveStatic(request, upstream, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(upstream.toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return request.method === "HEAD" ? new Response(null, cached) : cached;

  const response = await fetch(upstream.toString(), { method: "GET", headers: { accept: request.headers.get("accept") || "*/*" } });
  if (response.status !== 200) return response;

  const stored = new Response(response.body, response);
  // /_next/static/ porte un nom unique par version : cache d'un an. Autres fichiers : une heure.
  const ttl = upstream.pathname.startsWith("/_next/static/") ? ONE_YEAR : 3600;
  stored.headers.set("Cache-Control", `public, max-age=${ttl}${ttl === ONE_YEAR ? ", immutable" : ""}`);
  stored.headers.delete("Set-Cookie");
  ctx.waitUntil(cache.put(cacheKey, stored.clone()));
  return request.method === "HEAD" ? new Response(null, stored) : stored;
}

function rewriteResponse(response, host, rootDomain) {
  const headers = new Headers(response.headers);

  // Redirection vers le domaine racine (relayé) : ramenée à l'adresse du centre.
  const location = headers.get("Location");
  if (location) {
    try {
      const target = new URL(location, `https://${rootDomain}`);
      if (target.hostname === rootDomain) {
        target.hostname = host;
        target.protocol = "https:";
        headers.set("Location", target.toString());
      }
    } catch {
      // Adresse illisible : laissée telle quelle.
    }
  }

  // Cookies : jamais d'attribut Domain (chaque centre a ses propres sessions).
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  if (cookies.length > 0) {
    headers.delete("Set-Cookie");
    for (const cookie of cookies) {
      headers.append("Set-Cookie", cookie.replace(/;\s*Domain=[^;]*/gi, ""));
    }
  }

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
