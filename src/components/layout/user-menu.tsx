"use client";

import { Camera, ChevronDown, KeyRound, LogOut, Moon, Sun } from "lucide-react";
import Link from "@/components/shared/app-link";
import { useTheme } from "next-themes";
import { useState, useSyncExternalStore, useTransition } from "react";

import { StaffPhotoDialog } from "@/components/shared/staff-photo-dialog";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { removeMyPhoto, updateMyPhoto } from "@/lib/actions/profile";
import { signOut } from "@/lib/auth/actions";
import { ROUTES } from "@/lib/auth/routes";
import { LABELS } from "@/lib/constants/labels";

export type ShellUser = {
  fullName: string;
  roleLabel: string;
  centerName: string;
  /** URL signée de la photo du compte, si elle existe. */
  photoUrl: string | null;
  /** « Ma photo » (comptes de centre ; faux pour le super-admin, sans centre). */
  canEditPhoto?: boolean;
};

const noop = () => () => {};

export function UserMenu({ user }: { user: ShellUser }) {
  const [pending, startTransition] = useTransition();
  const [photoOpen, setPhotoOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  // Le thème n'est connu qu'après hydratation : rendu serveur = thème clair.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-1 px-1" aria-label={LABELS.auth.userMenu.label}>
            <StudentAvatar name={user.fullName} photoUrl={user.photoUrl} className="size-9 border-0" />
            <ChevronDown className="size-4 text-subtle" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="flex items-center gap-3 py-2">
            <StudentAvatar name={user.fullName} photoUrl={user.photoUrl} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-semibold text-foreground">{user.fullName}</span>
              <span className="text-caption font-normal text-muted-foreground">{user.roleLabel}</span>
              {user.centerName ? (
                <span className="truncate text-caption font-normal text-muted-foreground">{user.centerName}</span>
              ) : null}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {user.canEditPhoto !== false ? (
            <DropdownMenuItem className="min-h-11 gap-3" onSelect={() => setPhotoOpen(true)}>
              <Camera className="size-5" aria-hidden />
              {LABELS.auth.userMenu.myPhoto}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild className="min-h-11 gap-3">
            <Link href={ROUTES.myPassword}>
              <KeyRound className="size-5" aria-hidden />
              {LABELS.passwords.mine.menu}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-11 gap-3" onSelect={() => setTheme(isDark ? "light" : "dark")}>
            {isDark ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
            {isDark ? LABELS.theme.toggleToLight : LABELS.theme.toggleToDark}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="min-h-11 gap-3"
            disabled={pending}
            onSelect={(event) => {
              event.preventDefault();
              startTransition(() => signOut());
            }}
          >
            <LogOut className="size-5" aria-hidden />
            {LABELS.auth.userMenu.signOut}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <StaffPhotoDialog
        open={photoOpen}
        onOpenChange={setPhotoOpen}
        title={LABELS.auth.photo.title}
        description={LABELS.auth.photo.description}
        name={user.fullName}
        currentUrl={user.photoUrl}
        onSave={updateMyPhoto}
        onRemove={removeMyPhoto}
      />
    </>
  );
}
