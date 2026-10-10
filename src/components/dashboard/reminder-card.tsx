"use client";

import { X } from "lucide-react";
import Link from "@/components/shared/app-link";
import { useState } from "react";

import { useLabels } from "@/lib/i18n/client";

type ReminderCardProps = {
  title: string;
  description: string;
  href: string;
  linkLabel: string;
};

/** Carte de rappel : dégradé bleu-violet, texte blanc, masquable pour la visite en cours. */
export function ReminderCard({ title, description, href, linkLabel }: ReminderCardProps) {
  const LABELS = useLabels();
  const [open, setOpen] = useState(true);
  if (!open) return null;

  return (
    <div className="relative flex flex-col gap-1.5 overflow-hidden rounded-xl bg-linear-to-br from-reminder-from to-reminder-to p-[18px] text-white shadow-card">
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label={LABELS.dashboard.reminder.dismiss}
        className="absolute top-2 end-2 flex size-8 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/15"
      >
        <X className="size-3.5" aria-hidden />
      </button>
      <p className="pe-8 text-body font-semibold">{title}</p>
      <p className="text-[11px] leading-4 text-white/80">{description}</p>
      <Link href={href} className="w-fit rounded-sm text-[11px] leading-4 underline underline-offset-2">
        {linkLabel}
      </Link>
    </div>
  );
}
