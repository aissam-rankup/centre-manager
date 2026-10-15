/**
 * Ressources pédagogiques (plateforme pédagogique) : types, fichiers acceptés,
 * contrôle du contenu réel d'un fichier envoyé.
 */

export const RESOURCE_TYPES = ["exercise", "exam", "summary", "other"] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

/** Types pour lesquels une date de rendu a un sens. */
export const RESOURCE_TYPES_WITH_DUE_DATE: readonly ResourceType[] = ["exercise", "exam"];

export const RESOURCE_BUCKET = "learning-resources";
/** Taille maximale d'un fichier (le bucket accepte 15 Mo ; l'envoi passe par le proxy, limité à 10 Mo). */
export const RESOURCE_MAX_BYTES = 8 * 1024 * 1024;

export const RESOURCE_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type ResourceMimeType = (typeof RESOURCE_MIME_TYPES)[number];

/** Signature des premiers octets : le contenu doit correspondre au type annoncé. */
export function detectResourceMime(bytes: Uint8Array): ResourceMimeType | null {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (starts(0x25, 0x50, 0x44, 0x46)) return "application/pdf";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp";
  }
  return null;
}

const EXTENSIONS: Record<ResourceMimeType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Nom de fichier stocké : sans accent ni caractère spécial, extension du type réel. */
export function storedFileName(original: string, mime: ResourceMimeType): string {
  const base = original
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "ressource"}.${EXTENSIONS[mime]}`;
}

/** « 1,2 Mo », « 350 Ko » */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
  return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}
