"use client";

import { Camera, LogOut } from "lucide-react";
import { useState, useTransition } from "react";

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
import { LABELS } from "@/lib/constants/labels";

export type ShellUser = {
  fullName: string;
  roleLabel: string;
  centerName: string;
  /** URL signée de la photo du compte, si elle existe. */
  photoUrl: string | null;
};

export function UserMenu({ user }: { user: ShellUser }) {
  const [pending, startTransition] = useTransition();
  const [photoOpen, setPhotoOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-3 px-2 lg:px-3" aria-label={LABELS.auth.userMenu.label}>
            <StudentAvatar name={user.fullName} photoUrl={user.photoUrl} className="size-8 border-0" />
            <span className="hidden flex-col items-start text-left leading-tight md:flex">
              <span className="text-caption font-semibold text-foreground">{user.fullName}</span>
              <span className="text-caption text-muted-foreground">{user.roleLabel}</span>
            </span>
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
          <DropdownMenuItem className="min-h-11 gap-3" onSelect={() => setPhotoOpen(true)}>
            <Camera className="size-5" aria-hidden />
            {LABELS.auth.userMenu.myPhoto}
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
