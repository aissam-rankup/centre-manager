import { MessageCircle, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LABELS } from "@/lib/constants/labels";
import { toTelHref, toWhatsAppHref } from "@/lib/phone";

type ContactButtonsProps = {
  phone: string | null;
  /** Nom du destinataire, pour les libellés accessibles. */
  name: string;
  /** « labeled » : boutons avec texte ; « icon » : icônes seules (listes). */
  variant?: "labeled" | "icon";
};

/** Appeler ou écrire sur WhatsApp au responsable. Rien n'est affiché sans numéro valide. */
export function ContactButtons({ phone, name, variant = "icon" }: ContactButtonsProps) {
  const tel = phone ? toTelHref(phone) : null;
  const whatsapp = phone ? toWhatsAppHref(phone) : null;
  if (!tel || !whatsapp) return null;

  if (variant === "labeled") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <a href={tel} aria-label={LABELS.contact.callLabel(name)}>
            <Phone aria-hidden />
            {LABELS.contact.call}
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={LABELS.contact.whatsappLabel(name)}>
            <MessageCircle aria-hidden />
            {LABELS.contact.whatsapp}
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-1">
      <Button asChild variant="ghost" size="icon">
        <a href={tel} aria-label={LABELS.contact.callLabel(name)}>
          <Phone aria-hidden />
        </a>
      </Button>
      <Button asChild variant="ghost" size="icon">
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={LABELS.contact.whatsappLabel(name)}>
          <MessageCircle aria-hidden />
        </a>
      </Button>
    </div>
  );
}
