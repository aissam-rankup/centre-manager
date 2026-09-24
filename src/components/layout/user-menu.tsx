"use client";

import { LogOut } from "lucide-react";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth/actions";
import { LABELS } from "@/lib/constants/labels";

export type ShellUser = {
  fullName: string;
  roleLabel: string;
  centerName: string;
};

export function UserMenu({ user }: { user: ShellUser }) {
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-3 px-2 lg:px-3" aria-label={LABELS.auth.userMenu.label}>
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-caption font-semibold text-primary-foreground">
            {initials(user.fullName)}
          </span>
          <span className="hidden flex-col items-start text-left leading-tight md:flex">
            <span className="text-caption font-semibold text-foreground">{user.fullName}</span>
            <span className="text-caption text-muted-foreground">{user.roleLabel}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
          <span className="font-semibold text-foreground">{user.fullName}</span>
          <span className="text-caption font-normal text-muted-foreground">{user.roleLabel}</span>
          {user.centerName ? (
            <span className="text-caption font-normal text-muted-foreground">{user.centerName}</span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
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
