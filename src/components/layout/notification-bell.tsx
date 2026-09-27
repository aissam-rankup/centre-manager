"use client";

import { Bell, BellRing, MessageSquareText, StickyNote } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LABELS } from "@/lib/constants/labels";
import type { NotificationItem, NotificationKind } from "@/lib/data/notifications";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const L = LABELS.notifications;
const SEEN_KEY = "centromanager:notifications-vues";

const KIND_ICON: Record<NotificationKind, typeof Bell> = {
  followUp: MessageSquareText,
  note: StickyNote,
  absenceAlert: BellRing,
};
const KIND_TONE: Record<NotificationKind, string> = {
  followUp: "bg-primary-soft text-primary",
  note: "bg-muted text-heading",
  absenceAlert: "bg-warning/15 text-warning-ink",
};

/** Dernière consultation (préférence locale, sans incidence si le stockage est indisponible). */
function readSeen(): string {
  try {
    return window.localStorage.getItem(SEEN_KEY) ?? "";
  } catch {
    return "";
  }
}

const subscribe = (callback: () => void) => {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
};

type NotificationBellProps = {
  items: NotificationItem[];
  /** Préfixe des fiches élèves (ex. « /admin/eleves »). */
  fileBase: string;
};

/** Cloche de l'en-tête : relances, notes de fiche et alertes ; compteur des nouveautés. */
export function NotificationBell({ items, fileBase }: NotificationBellProps) {
  const storedSeen = useSyncExternalStore(subscribe, readSeen, () => "");
  const [seenOverride, setSeenOverride] = useState<string | null>(null);
  const seen = seenOverride ?? storedSeen;
  const unread = seen ? items.filter((item) => item.at > seen).length : items.length;

  const markSeen = () => {
    const latest = items[0]?.at ?? new Date().toISOString();
    setSeenOverride(latest);
    try {
      window.localStorage.setItem(SEEN_KEY, latest);
      // Synchronise les autres cloches de la page (mobile / ordinateur).
      window.dispatchEvent(new StorageEvent("storage", { key: SEEN_KEY }));
    } catch {
      // Stockage indisponible : le compteur revient au prochain chargement.
    }
  };

  return (
    <DropdownMenu onOpenChange={(open) => open && markSeen()}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-muted-foreground" aria-label={L.open(unread)}>
          <Bell className="size-5" aria-hidden />
          {unread > 0 ? (
            <span className="numeric absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-none text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(360px,calc(100vw-32px))] p-0">
        <div className="border-b border-divider px-4 py-3">
          <p className="text-section">{L.title}</p>
          <p className="text-caption text-muted-foreground">{L.description}</p>
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-6 text-center text-muted-foreground">{L.empty}</p>
        ) : (
          <ul className="max-h-[420px] divide-y divide-divider overflow-y-auto">
            {items.map((item) => {
              const Icon = KIND_ICON[item.kind];
              const isNew = !seen || item.at > seen;
              return (
                <li key={item.id}>
                  <Link
                    href={`${fileBase}/${item.studentId}`}
                    className="flex gap-3 px-4 py-3 transition-colors hover:bg-row-hover"
                  >
                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", KIND_TONE[item.kind])}>
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium text-heading">{item.studentName}</span>
                        {isNew ? <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden /> : null}
                      </span>
                      <span className="text-caption text-muted-foreground">
                        {L.kinds[item.kind]}
                        {item.detail ? ` · ${item.detail}` : ""}
                      </span>
                      {item.body ? <span className="line-clamp-2 text-caption text-foreground">{item.body}</span> : null}
                      <span className="text-caption text-subtle">
                        {formatDateTime(item.at)}
                        {item.author ? ` · ${L.by(item.author)}` : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
