import type { Database } from "@/lib/supabase/database.types";

export type UserRole = Database["public"]["Enums"]["user_role"];
/** Rôles rattachés à un centre. */
export type CenterRole = Exclude<UserRole, "super_admin">;

export const ROUTES = {
  login: "/connexion",
  inactive: "/compte-inactif",
  /** Accueil des comptes invités : choix du mot de passe. */
  welcome: "/bienvenue",
  /** Centre suspendu ou résilié : écran explicatif et contact. */
  suspended: "/acces-suspendu",
  platform: {
    home: "/platform",
    centers: "/platform/centres",
    newCenter: "/platform/centres/nouveau",
    catalogue: "/platform/catalogue",
    billing: "/platform/facturation",
    settings: "/platform/reglages",
  },
  assistant: {
    home: "/assistant",
    students: "/assistant/eleves",
    newStudent: "/assistant/eleves/nouveau",
    newTeacher: "/assistant/professeurs/nouveau",
    absences: "/assistant/absences",
    reenrollment: "/assistant/reinscriptions",
    cash: "/assistant/caisse",
    /** Séances d'un jour (aujourd'hui par défaut) et appel d'une séance. */
    sessions: "/assistant/seances",
    session: (slotId: string, date: string) => `/assistant/seances/${slotId}?date=${date}`,
  },
  teacher: {
    home: "/professeur",
    schedule: "/professeur/emploi-du-temps",
    call: (slotId: string) => `/professeur/appel/${slotId}`,
    /** Fiche d'assiduité d'un élève (matières du professeur). */
    student: (studentId: string) => `/professeur/eleves/${studentId}`,
  },
  admin: {
    home: "/admin",
    students: "/admin/eleves",
    subjects: "/admin/niveaux-matieres",
    schedule: "/admin/planning",
    users: "/admin/utilisateurs",
    reports: "/admin/rapports",
    absences: "/admin/absences",
    branding: "/admin/marque",
    settings: "/admin/reglages",
    payroll: "/admin/paie",
    expenses: "/admin/charges",
    rooms: "/admin/salles",
    reenrollment: "/admin/reinscriptions",
    cash: "/admin/caisse",
  },
  /** Reçu imprimable (accueil et administration). */
  receipt: (id: string) => `/recus/${id}`,
} as const;

/** Espace d'accueil de chaque rôle. */
export const ROLE_HOME: Record<UserRole, string> = {
  admin: ROUTES.admin.home,
  assistant: ROUTES.assistant.home,
  teacher: ROUTES.teacher.home,
  super_admin: ROUTES.platform.home,
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
