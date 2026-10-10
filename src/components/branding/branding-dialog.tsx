"use client";

import { Palette } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BrandingForm } from "@/components/branding/branding-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useLabels } from "@/lib/i18n/client";
import type { BrandingFormInput } from "@/lib/validation/branding";

/** Console : réglages de marque d'un centre en marque blanche (y compris le domaine). */
export function BrandingDialog({
  defaults,
  domainVerified,
  dnsTarget,
}: {
  defaults: BrandingFormInput;
  domainVerified: boolean;
  dnsTarget: string | null;
}) {
  const L = useLabels().branding;
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-fit">
          <Palette aria-hidden />
          {L.edit}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-section">{L.title}</DialogTitle>
          <DialogDescription>{L.description}</DialogDescription>
        </DialogHeader>
        <BrandingForm
          defaults={defaults}
          superAdmin
          domainVerified={domainVerified}
          dnsTarget={dnsTarget}
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
