import type { ShellUser } from "@/components/layout/user-menu";
import type { SessionProfile } from "@/lib/auth/session";
import type { AppLabels } from "@/lib/constants/labels";

/** Données du compte affichées dans la coque applicative. */
export function toShellUser(profile: SessionProfile, LABELS: AppLabels): ShellUser {
  return {
    fullName: profile.fullName,
    roleLabel: LABELS.roles[profile.role],
    centerName: profile.centerName,
    photoUrl: profile.photoUrl,
    // Pas de photo à déposer en support (lecture seule).
    canEditPhoto: !profile.support,
  };
}
