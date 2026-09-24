import type { Database } from "@/lib/supabase/database.types";

export type UserRole = Database["public"]["Enums"]["user_role"];

export const ROUTES = {
  login: "/connexion",
  inactive: "/compte-inactif",
  assistant: {
    home: "/assistant",
    students: "/assistant/eleves",
    newStudent: "/assistant/eleves/nouveau",
    newTeacher: "/assistant/professeurs/nouveau",
  },
  teacher: {
    home: "/professeur",
    schedule: "/professeur/emploi-du-temps",
  },
  admin: {
    home: "/admin",
    students: "/admin/eleves",
    subjects: "/admin/niveaux-matieres",
    schedule: "/admin/planning",
    users: "/admin/utilisateurs",
    reports: "/admin/rapports",
  },
} as const;

/** Espace d'accueil de chaque rôle. */
export const ROLE_HOME: Record<UserRole, string> = {
  admin: ROUTES.admin.home,
  assistant: ROUTES.assistant.home,
  teacher: ROUTES.teacher.home,
};

/** Paramètre de requête portant la page demandée avant la connexion. */
export const NEXT_PARAM = "suivant";

/** Rôle propriétaire d'un chemin, ou null si le chemin n'appartient à aucun espace. */
export function roleForPath(pathname: string): UserRole | null {
  for (const [role, home] of Object.entries(ROLE_HOME) as [UserRole, string][]) {
    if (pathname === home || pathname.startsWith(`${home}/`)) return role;
  }
  return null;
}

/**
 * N'accepte qu'un chemin interne (« /… »), jamais une URL externe
 * (« //site », « /\\site », « https:// ») : protection contre les redirections ouvertes.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}

/** Destination après connexion : la page demandée si elle appartient au rôle, sinon son accueil. */
export function destinationAfterLogin(role: UserRole, next: string | null): string {
  const safe = safeNextPath(next);
  if (safe && roleForPath(safe) === role) return safe;
  return ROLE_HOME[role];
}
