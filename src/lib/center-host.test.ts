import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  centerAccessDecision,
  type CenterFetcher,
  clearCenterCache,
  decodeCenter,
  encodeCenter,
  getCenterUrl,
  getRootUrl,
  type HostEnv,
  lookupCenter,
  resolveTarget,
  safeEqual,
  trustedProxy,
} from "@/lib/center-host";

const SECRET = "s".repeat(40);
const PROD: HostEnv = { nodeEnv: "production", rootDomain: "dirassty.com", proxySecret: SECRET };
const DEV: HostEnv = { nodeEnv: "development", rootDomain: "localhost:3000", proxySecret: undefined };

function headers(values: Record<string, string>): Headers {
  return new Headers(values);
}

describe("secret du Worker", () => {
  it("compare en temps constant et refuse toute différence", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });

  it("exige PROXY_SECRET de 32 caractères au moins", () => {
    expect(trustedProxy(SECRET, PROD)).toBe(true);
    expect(trustedProxy("court", { ...PROD, proxySecret: "court" })).toBe(false);
    expect(trustedProxy(null, PROD)).toBe(false);
    expect(trustedProxy(SECRET, { ...PROD, proxySecret: undefined })).toBe(false);
  });
});

describe("résolution de l'adresse", () => {
  it("domaine racine et www", () => {
    expect(resolveTarget(headers({ host: "dirassty.com" }), PROD)).toEqual({ kind: "root" });
    expect(resolveTarget(headers({ host: "www.dirassty.com" }), PROD)).toEqual({ kind: "root" });
  });

  it("X-Center-Slug avec le bon secret : centre (minuscules)", () => {
    const h = headers({ host: "dirassty.com", "x-center-slug": "Excellence", "x-proxy-secret": SECRET });
    expect(resolveTarget(h, PROD)).toEqual({ kind: "slug", slug: "excellence" });
  });

  it("X-Center-Slug sans secret ou avec un faux secret : ignoré (domaine racine)", () => {
    expect(resolveTarget(headers({ host: "dirassty.com", "x-center-slug": "excellence" }), PROD)).toEqual({ kind: "root" });
    expect(
      resolveTarget(headers({ host: "dirassty.com", "x-center-slug": "excellence", "x-proxy-secret": "x".repeat(40) }), PROD),
    ).toEqual({ kind: "root" });
  });

  it("X-Center-Slug ignoré si PROXY_SECRET n'est pas défini", () => {
    const h = headers({ host: "dirassty.com", "x-center-slug": "excellence", "x-proxy-secret": "" });
    expect(resolveTarget(h, { ...PROD, proxySecret: undefined })).toEqual({ kind: "root" });
  });

  it("sans ROOT_DOMAIN : tout est le domaine racine, même avec l'en-tête", () => {
    const h = headers({ host: "excellence.dirassty.com", "x-center-slug": "excellence", "x-proxy-secret": SECRET });
    expect(resolveTarget(h, { ...PROD, rootDomain: undefined })).toEqual({ kind: "root" });
  });

  it("<slug>.localhost reconnu en développement seulement", () => {
    expect(resolveTarget(headers({ host: "excellence.localhost:3000" }), DEV)).toEqual({ kind: "slug", slug: "excellence" });
    expect(resolveTarget(headers({ host: "localhost:3000" }), DEV)).toEqual({ kind: "root" });
    // Production : jamais lu depuis Host, quel que soit ROOT_DOMAIN.
    expect(resolveTarget(headers({ host: "excellence.localhost:3000" }), { ...DEV, nodeEnv: "production" })).toEqual({ kind: "root" });
    expect(resolveTarget(headers({ host: "excellence.localhost" }), PROD)).toEqual({ kind: "root" });
  });

  it("le sous-domaine n'est jamais lu depuis Host en production", () => {
    expect(resolveTarget(headers({ host: "excellence.dirassty.com" }), PROD)).toEqual({ kind: "domain", domain: "excellence.dirassty.com" });
  });

  it("ancienne adresse de l'hébergeur : redirection vers le domaine racine", () => {
    expect(resolveTarget(headers({ host: "darkslateblue-clam-500511.hostingersite.com" }), PROD)).toEqual({ kind: "legacy" });
  });
});

describe("adresses absolues", () => {
  it("getCenterUrl construit https://<slug>.<ROOT_DOMAIN><path>", () => {
    expect(getCenterUrl({ slug: "excellence" }, "/connexion", PROD)).toBe("https://excellence.dirassty.com/connexion");
    expect(getCenterUrl({ slug: "excellence" }, "bienvenue", PROD)).toBe("https://excellence.dirassty.com/bienvenue");
    expect(getCenterUrl({ slug: "excellence" }, "", PROD)).toBe("https://excellence.dirassty.com");
  });

  it("en local : http et port", () => {
    expect(getCenterUrl({ slug: "excellence" }, "/eleve/connexion", DEV)).toBe("http://excellence.localhost:3000/eleve/connexion");
    expect(getRootUrl("/", DEV)).toBe("http://localhost:3000/");
  });
});

describe("centre résolu", () => {
  beforeEach(() => clearCenterCache());

  const row = { center_id: "c1", name: "Excellence", slug: "excellence", white_label: false, branding: null, moved: false };

  it("trouve, puis garde en cache", async () => {
    const fetcher = vi.fn<CenterFetcher>(async () => row);
    const first = await lookupCenter({ kind: "slug", slug: "excellence" }, fetcher, 1000);
    const second = await lookupCenter({ kind: "slug", slug: "excellence" }, fetcher, 2000);
    expect(first).toEqual({ status: "found", center: { id: "c1", slug: "excellence", name: "Excellence", whiteLabel: false, branding: null } });
    expect(second).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    // Cache expiré : nouvelle lecture.
    await lookupCenter({ kind: "slug", slug: "excellence" }, fetcher, 1000 + 61_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("ancienne adresse : nouvelle adresse à rediriger", async () => {
    const fetcher: CenterFetcher = async () => ({ ...row, slug: "excellence-rabat", moved: true });
    expect(await lookupCenter({ kind: "slug", slug: "excellence" }, fetcher)).toEqual({ status: "moved", slug: "excellence-rabat" });
  });

  it("adresse inconnue ou invalide : introuvable (sans lecture si invalide)", async () => {
    const fetcher = vi.fn<CenterFetcher>(async () => null);
    expect(await lookupCenter({ kind: "slug", slug: "inconnu" }, fetcher)).toEqual({ status: "unknown" });
    expect(await lookupCenter({ kind: "slug", slug: "-mal--forme" }, fetcher)).toEqual({ status: "unknown" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("base injoignable : rien en cache", async () => {
    const failing = vi.fn<CenterFetcher>(async () => {
      throw new Error("réseau");
    });
    expect(await lookupCenter({ kind: "slug", slug: "excellence" }, failing)).toEqual({ status: "unavailable" });
    const ok = vi.fn<CenterFetcher>(async () => row);
    expect((await lookupCenter({ kind: "slug", slug: "excellence" }, ok)).status).toBe("found");
  });

  it("en-tête interne : aller-retour, valeur forgée refusée", () => {
    const center = { id: "c1", slug: "excellence", name: "Centre Élan — Rabat", whiteLabel: true, branding: { brand_name: "Élan" } };
    expect(decodeCenter(encodeCenter(center))).toEqual(center);
    expect(decodeCenter("n'importe quoi")).toBeNull();
    expect(decodeCenter(encodeURIComponent(JSON.stringify({ id: 1 })))).toBeNull();
    expect(decodeCenter(null)).toBeNull();
  });
});

describe("compte d'un autre centre", () => {
  it("compte du centre de l'adresse : accepté", () => {
    expect(centerAccessDecision({ hostCenterId: "a", accountCenterId: "a", superAdmin: false, subdomains: true })).toBe("allow");
  });

  it("compte d'un autre centre : refusé", () => {
    expect(centerAccessDecision({ hostCenterId: "a", accountCenterId: "b", superAdmin: false, subdomains: true })).toBe("wrong-center");
  });

  it("compte sans centre ou console sur l'adresse d'un centre : refusé", () => {
    expect(centerAccessDecision({ hostCenterId: "a", accountCenterId: null, superAdmin: false, subdomains: true })).toBe("wrong-center");
    expect(centerAccessDecision({ hostCenterId: "a", accountCenterId: null, superAdmin: true, subdomains: true })).toBe("wrong-center");
  });

  it("domaine racine : compte de centre transféré, console acceptée", () => {
    expect(centerAccessDecision({ hostCenterId: null, accountCenterId: "a", superAdmin: false, subdomains: true })).toBe("transfer");
    expect(centerAccessDecision({ hostCenterId: null, accountCenterId: null, superAdmin: true, subdomains: true })).toBe("allow");
  });

  it("sans sous-domaines (un seul domaine) : aucun transfert", () => {
    expect(centerAccessDecision({ hostCenterId: null, accountCenterId: "a", superAdmin: false, subdomains: false })).toBe("allow");
  });
});
