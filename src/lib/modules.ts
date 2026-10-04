/**
 * Modules activables (page 9).
 *
 * Chaque fonctionnalité vendable est un module avec son interrupteur ; un pack
 * n'est qu'un regroupement de modules. La source de vérité est la table
 * center_modules : l'application lit les modules actifs du centre (session,
 * middleware) et la base les impose elle-même (RLS restrictive, fonction
 * pre-request de l'API). Masquer un bouton n'est qu'un confort visuel.
 *
 * Règle des demandes futures : une fonctionnalité utile à la majorité rejoint
 * le socle ; utile à un groupe, elle devient un module d'un pack existant ou
 * d'un nouveau pack ; propre à un seul client, elle est refusée ou facturée en
 * sur-mesure, et livrée comme un module derrière un interrupteur, jamais comme
 * une copie du code.
 */

import { ROUTES } from "@/lib/auth/routes";

export const MODULE_KEYS = ["finance", "reenrollment", "absence_tracking", "white_label", "lms"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULE_SOURCES = ["plan", "manual", "trial"] as const;
export type ModuleSource = (typeof MODULE_SOURCES)[number];

const isModuleKey = (value: unknown): value is ModuleKey =>
  typeof value === "string" && (MODULE_KEYS as readonly string[]).includes(value);

/** Modules connus parmi une liste lue en base (les clés inconnues sont ignorées). */
export function parseModules(value: unknown): ModuleKey[] {
  return Array.isArray(value) ? value.filter(isModuleKey) : [];
}

export function hasModule(modules: readonly ModuleKey[], key: ModuleKey): boolean {
  return modules.includes(key);
}

/** Routes réservées à un module : sans lui, 404 (middleware et garde serveur). */
const MODULE_ROUTES: readonly { prefix: string; module: ModuleKey }[] = [
  { prefix: ROUTES.admin.payroll, module: "finance" },
  { prefix: ROUTES.admin.expenses, module: "finance" },
  { prefix: ROUTES.admin.cash, module: "finance" },
  { prefix: ROUTES.assistant.cash, module: "finance" },
  { prefix: "/recus", module: "finance" },
  { prefix: ROUTES.admin.reenrollment, module: "reenrollment" },
  { prefix: ROUTES.assistant.reenrollment, module: "reenrollment" },
  { prefix: "/fiches/assiduite", module: "absence_tracking" },
  { prefix: ROUTES.admin.branding, module: "white_label" },
];

/** Module dont dépend une route, ou null pour une route du socle. */
export function moduleForPath(pathname: string): ModuleKey | null {
  const route = MODULE_ROUTES.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return route?.module ?? null;
}
