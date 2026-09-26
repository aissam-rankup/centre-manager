import type { ShellUser } from "@/components/layout/user-menu";
import type { SessionProfile } from "@/lib/auth/session";
import { LABELS } from "@/lib/constants/labels";

/** Données du compte affichées dans la coque applicative. */
export function toShellUser(profile: SessionProfile): ShellUser {
  return {
    fullName: profile.fullName,
    roleLabel: LABELS.roles[profile.role],
    centerName: profile.centerName,
    photoUrl: profile.photoUrl,
  };
}
