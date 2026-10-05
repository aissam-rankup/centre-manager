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
  /** Changement de son propre mot de passe (tous les rôles). */
  myPassword: "/mon-mot-de-passe",
  /** Mot de passe temporaire (défini par un responsable) : à remplacer avant toute autre page. */
  forcedPassword: "/nouveau-mot-de-passe",
  /** Session fermée par une réinitialisation : déconnexion, puis écran de connexion. */
  sessionClosed: "/session-fermee",
  /** Jeton renouvelé (rôle, changement obligatoire), puis espace du rôle. */
  refreshSession: "/actualiser-session",
  /** Sous-domaine sans centre : page sobre avec un lien vers le domaine racine. */
  centerNotFound: "/centre-introuvable",
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
    /** Ressources pédagogiques publiées par le professeur (plateforme pédagogique). */
    resources: "/professeur/ressources",
    newResource: "/professeur/ressources/nouvelle",
    resource: (id: string) => `/professeur/ressources/${id}`,
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
  /** Fichier d'une ressource pédagogique (URL signée, après contrôle d'accès). */
  resourceFile: (id: string) => `/ressources/${id}/fichier`,
  /** Espace élève (rôle student_user) et sa connexion par code. */
  student: {
    home: "/eleve",
    login: "/eleve/connexion",
  },
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

/** Écran de connexion du centre après transfert depuis le domaine racine (se reconnecter une fois). */
export const TRANSFER_PARAM = "transfert";

/** Compte refusé sur l'adresse d'un autre centre : adresse (slug) de son centre, « plateforme » pour la console. */
export const OTHER_CENTER_PARAM = "centre-du-compte";
export const PLATFORM_ACCOUNT = "plateforme";

/** Écran de connexion après une session fermée par une réinitialisation du mot de passe. */
export const SESSION_CLOSED_PARAM = "session";

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
