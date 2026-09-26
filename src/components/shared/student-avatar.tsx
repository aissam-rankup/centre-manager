import { cn } from "@/lib/utils";

export type AvatarSize = "mini" | "list" | "profile" | "call";
export type AvatarStatus = "upToDate" | "overdue" | "neutral";

const SIZE_STYLES: Record<AvatarSize, { box: string; text: string; px: number }> = {
  // Mention compacte d'un membre de l'équipe (planning).
  mini: { box: "size-6", text: "text-[10px]", px: 24 },
  list: { box: "size-10", text: "text-caption", px: 40 },
  profile: { box: "size-24", text: "text-section", px: 96 },
  call: { box: "size-[200px]", text: "text-5xl", px: 200 },
};

const STATUS_BORDER: Record<AvatarStatus, string> = {
  upToDate: "border-success",
  overdue: "border-danger",
  neutral: "border-border",
};

type StudentAvatarProps = {
  name: string;
  photoUrl?: string | null;
  size?: AvatarSize;
  status?: AvatarStatus;
  className?: string;
};

/** Photo élève circulaire, bordure de 2 px à la couleur du statut. */
export function StudentAvatar({ name, photoUrl, size = "list", status = "neutral", className }: StudentAvatarProps) {
  const { box, text, px } = SIZE_STYLES[size];

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-muted",
        box,
        STATUS_BORDER[status],
        className,
      )}
    >
      {photoUrl ? (
        // Les photos proviennent d'URL signées Supabase : pas d'optimisation next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt={name} width={px} height={px} className="size-full object-cover" />
      ) : (
        <span className={cn("font-semibold text-muted-foreground select-none", text)} aria-label={name} role="img">
          {initials(name)}
        </span>
      )}
    </span>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
