"use client";

import { Eye, EyeOff } from "lucide-react";
import { type ComponentProps, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLabels } from "@/lib/i18n/client";

/** Champ mot de passe avec affichage à la demande. */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<typeof Input>, "type">) {
  const L = useLabels().auth.login;
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input type={shown ? "text" : "password"} className={`pe-12 ${className ?? ""}`} spellCheck={false} {...props} />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-0 end-0"
        onClick={() => setShown((value) => !value)}
        aria-label={shown ? L.hidePassword : L.showPassword}
        aria-pressed={shown}
      >
        {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
      </Button>
    </div>
  );
}
