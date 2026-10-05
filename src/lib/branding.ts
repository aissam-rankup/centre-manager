import "server-only";

import type { Metadata } from "next";
import { headers } from "next/headers";
import { cache } from "react";

import { getAuthState } from "@/lib/auth/session";
import { type BrandingData, parseBranding } from "@/lib/branding-data";
import { LABELS } from "@/lib/constants/labels";
import { publicEnv } from "@/lib/env";
import { CENTER_HEADER, decodeCenter } from "@/lib/center-host";
import { createClient } from "@/lib/supabase/server";

/** Marque affichée : celle du centre en marque blanche, sinon celle de la plateforme. */
export type Brand = {
  whiteLabel: boolean;
  /** Nom affiché (onglet, logo, textes) : nom de marque du centre ou « CentroManager ». */
  name: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  loginBackgroundUrl: string | null;
  colors: { primary: string | null; secondary: string | null; accent: string | null };
};

export const PLATFORM_BRAND: Brand = {
  whiteLabel: false,
  name: LABELS.app.name,
  logoUrl: null,
  faviconUrl: null,
  loginBackgroundUrl: null,
  colors: { primary: null, secondary: null, accent: null },
};

export function brandFrom(branding: BrandingData | null, centerName: string): Brand {
  if (!branding) return PLATFORM_BRAND;
  return {
    whiteLabel: true,
    name: branding.brand_name || centerName || PLATFORM_BRAND.name,
    logoUrl: branding.logo_url,
    faviconUrl: branding.favicon_url,
    loginBackgroundUrl: branding.login_background_url,
    colors: { primary: branding.primary_color, secondary: branding.secondary_color, accent: branding.accent_color },
  };
}

export type CurrentCenter = { centerId: string; slug: string; name: string; brand: Brand };

/**
 * Centre désigné par l'adresse (sous-domaine ou domaine personnalisé vérifié),
 * sans session : résolu par le proxy (en-tête interne, jamais celui du client).
 * Affichage et orientation seulement : n'autorise rien.
 */
export const getCurrentCenter = cache(async (): Promise<CurrentCenter | null> => {
  const center = decodeCenter((await headers()).get(CENTER_HEADER));
  if (!center) return null;
  return {
    centerId: center.id,
    slug: center.slug,
    name: center.name,
    brand: brandFrom(parseBranding(center.branding), center.name),
  };
});

/** Marque des espaces d'un centre : celle du compte connecté (ou du centre consulté en support). */
export const getSessionBrand = cache(async (): Promise<Brand> => {
  const state = await getAuthState();
  if (state.status === "student") return brandFrom(state.student.branding, state.student.centerName);
  if (state.status !== "authenticated") return PLATFORM_BRAND;
  return brandFrom(state.profile.branding, state.profile.centerName);
});

/** Marque des pages publiques (connexion, invitation) : celle de l'adresse, sinon de la session. */
export const getPublicBrand = cache(async (): Promise<Brand> => {
  const host = await getCurrentCenter();
  if (host) return host.brand;
  return getSessionBrand();
});

/**
 * Marque du document (onglet, favicon) : adresse d'un centre, sinon compte
 * connecté. Jamais celle d'un centre consulté en support : la console reste
 * à la marque de la plateforme.
 */
export const getDocumentBrand = cache(async (): Promise<Brand> => {
  const host = await getCurrentCenter();
  if (host) return host.brand;
  const state = await getAuthState();
  if (state.status === "student") return brandFrom(state.student.branding, state.student.centerName);
  if (state.status !== "authenticated" || state.profile.support) return PLATFORM_BRAND;
  return brandFrom(state.profile.branding, state.profile.centerName);
});

/**
 * Variables CSS de la marque, injectées côté serveur (aucun clignotement).
 * Les couleurs sont validées en base (#rrggbb) avant d'arriver ici.
 */
export function brandCss(brand: Brand): string {
  const { primary: p, secondary: s, accent: a } = brand.colors;
  if (!brand.whiteLabel || (!p && !s && !a)) return "";
  const light: string[] = [];
  const dark: string[] = [];
  if (p) {
    light.push(
      `--primary:${p}`,
      `--primary-hover:color-mix(in srgb,${p} 85%,black)`,
      `--primary-soft:color-mix(in srgb,${p} 10%,white)`,
      `--accent:color-mix(in srgb,${p} 10%,white)`,
      `--accent-foreground:${p}`,
      `--ring:${p}`,
      `--brand:${p}`,
      `--brand-ink:${p}`,
      `--sidebar:${p}`,
      `--reminder-to:${p}`,
    );
    dark.push(
      `--primary:color-mix(in srgb,${p} 85%,white)`,
      `--primary-hover:color-mix(in srgb,${p} 70%,white)`,
      `--primary-soft:color-mix(in srgb,${p} 28%,#0c0a1d)`,
      `--accent:color-mix(in srgb,${p} 28%,#0c0a1d)`,
      `--accent-foreground:color-mix(in srgb,${p} 45%,white)`,
      `--ring:color-mix(in srgb,${p} 65%,white)`,
      `--brand:color-mix(in srgb,${p} 65%,white)`,
      `--brand-ink:color-mix(in srgb,${p} 55%,white)`,
      `--sidebar:color-mix(in srgb,${p} 85%,black)`,
      `--reminder-to:${p}`,
    );
  }
  if (s) {
    light.push(`--reminder-from:${s}`, `--app-to:color-mix(in srgb,${s} 22%,white)`);
    dark.push(`--reminder-from:${s}`, `--app-to:color-mix(in srgb,${s} 30%,#0c0a1d)`);
  }
  if (a) {
    for (const list of [light, dark]) list.push(`--highlight:${a}`, `--highlight-ink:${a}`, `--tile-4:${a}`);
  }
  return `:root{${light.join(";")}}.dark{${dark.join(";")}}`;
}

/** Titre d'onglet et favicon : marque du centre, ou plateforme. */
export function brandMetadata(brand: Brand): Metadata {
  if (!brand.whiteLabel) return {};
  return {
    title: { template: `%s · ${brand.name}`, default: brand.name },
    applicationName: brand.name,
    description: null,
    icons: brand.faviconUrl ? { icon: brand.faviconUrl } : undefined,
  };
}

/** Cible DNS des domaines personnalisés : PLATFORM_CNAME_TARGET, sinon ROOT_DOMAIN ou l'hôte de l'application. */
export function dnsTarget(): string | null {
  const explicit = process.env.PLATFORM_CNAME_TARGET ?? process.env.ROOT_DOMAIN?.replace(/:\d+$/, "");
  if (explicit) return explicit.toLowerCase().replace(/\.$/, "");
  return publicEnv.NEXT_PUBLIC_APP_URL ? new URL(publicEnv.NEXT_PUBLIC_APP_URL).hostname : null;
}

export type BrandingSettings = {
  /** Module marque blanche actif pour ce centre. */
  whiteLabel: boolean;
  editable: boolean;
  domainVerified: boolean;
  values: {
    brandName: string;
    logoUrl: string;
    faviconUrl: string;
    loginBackgroundUrl: string;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    senderName: string;
    supportEmail: string;
    supportPhone: string;
    customDomain: string;
  };
};

/** Réglages de marque d'un centre (édition : super-admin, ou administrateur du centre). */
export async function getBrandingSettings(centerId: string): Promise<BrandingSettings | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("center_branding_settings", { p_center_id: centerId }).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    whiteLabel: data.white_label,
    editable: data.editable,
    domainVerified: data.domain_verified,
    values: {
      brandName: data.brand_name ?? "",
      logoUrl: data.logo_url ?? "",
      faviconUrl: data.favicon_url ?? "",
      loginBackgroundUrl: data.login_background_url ?? "",
      primaryColor: data.primary_color ?? "",
      secondaryColor: data.secondary_color ?? "",
      accentColor: data.accent_color ?? "",
      senderName: data.email_sender_name ?? "",
      supportEmail: data.support_email ?? "",
      supportPhone: data.support_phone ?? "",
      customDomain: data.custom_domain ?? "",
    },
  };
}

/** Adresse publique de l'application (liens à transmettre). */
export async function appOrigin(): Promise<string> {
  if (publicEnv.NEXT_PUBLIC_APP_URL) return publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
