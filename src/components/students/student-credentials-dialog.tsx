"use client";

import { Copy, KeyRound, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LABELS as FRENCH_LABELS } from "@/lib/constants/labels";
import { useLabels } from "@/lib/i18n/client";
import { toWhatsAppHref } from "@/lib/phone";
import { formatLoginCode } from "@/lib/student-codes";

export type ShownCredentials = { code: string; password: string; loginUrl: string };

/**
 * Identifiants d'un accès élève, affichés une seule fois : copie, ou envoi au
 * responsable sur WhatsApp. Rien n'est conservé en clair ensuite.
 */
export function StudentCredentialsDialog({
  credentials,
  studentName,
  guardianPhone,
  onClose,
}: {
  credentials: ShownCredentials | null;
  studentName: string;
  guardianPhone: string | null;
  onClose: () => void;
}) {
  const LABELS = useLabels();
  const C = LABELS.studentAccess.credentials;
  if (!credentials) return null;
  const code = formatLoginCode(credentials.code);
  // Message envoyé au responsable : toujours en français.
  const message = FRENCH_LABELS.studentAccess.credentials.message(studentName, credentials.loginUrl, code, credentials.password);
  const chat = guardianPhone ? toWhatsAppHref(guardianPhone) : null;
  const whatsapp = chat ? `${chat}?text=${encodeURIComponent(message)}` : null;

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(C.copied);
    } catch {
      // Copie indisponible : les valeurs restent lisibles à l'écran.
    }
  };

  const rows = [
    { label: C.url, value: credentials.loginUrl, mono: false },
    { label: C.code, value: code, mono: true },
    { label: C.password, value: credentials.password, mono: true },
  ];

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" aria-hidden />
            {C.title}
          </DialogTitle>
          <DialogDescription>{C.description}</DialogDescription>
        </DialogHeader>
        <dl className="flex flex-col gap-3">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2">
              <div className="flex min-w-0 flex-col">
                <dt className="text-caption text-muted-foreground">{row.label}</dt>
                <dd className={row.mono ? "numeric text-section tracking-wider text-heading" : "break-all text-caption"}>{row.value}</dd>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label={`${C.copy} : ${row.label}`} onClick={() => void copy(row.value)}>
                <Copy aria-hidden />
              </Button>
            </div>
          ))}
        </dl>
        <DialogFooter className="gap-2 sm:justify-between">
          {whatsapp ? (
            <Button asChild variant="outline">
              <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                <MessageCircle aria-hidden />
                {C.whatsapp}
              </a>
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" onClick={onClose}>
            {C.done}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
