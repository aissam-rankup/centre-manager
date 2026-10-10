"use client";

import { BellRing, Check, ChevronDown, LoaderCircle, MessageCircle, Phone, SkipForward, UserCheck, Users } from "lucide-react";
import Link from "@/components/shared/app-link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/shared/form-field";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { AbsenceToNotify, NotificationChannel } from "@/lib/absences";
import { notifyAbsence } from "@/lib/actions/absence-alerts";
import { formatDate, formatDateTime, formatDateWithWeekday } from "@/lib/format";
import { useLabels, useLocale, useMessage } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/locale";
import { formatPhone, isValidPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";

type Send = (input: { attendanceId: string; channel: NotificationChannel; phone?: string; repeat?: boolean }) => Promise<boolean>;

/**
 * Envoi d'une notification : pour WhatsApp, la fenêtre est ouverte pendant le
 * clic (sinon bloquée) puis dirigée vers le message pré-rempli.
 */
function useNotify(): { send: Send; pending: boolean } {
  const LABELS = useLabels();
  const message = useMessage();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const send: Send = (input) =>
    new Promise((resolve) => {
      const target = input.channel === "whatsapp" ? window.open("about:blank", "_blank") : null;
      startTransition(async () => {
        const result = await notifyAbsence(input);
        if (!result.ok) {
          target?.close();
          toast.error(message(result.error));
          resolve(false);
          return;
        }
        if (result.data.href) {
          if (target) target.location.href = result.data.href;
          else window.location.assign(result.data.href);
        }
        toast.success(LABELS.absenceAlerts.recorded);
        router.refresh();
        resolve(true);
      });
    });

  return { send, pending };
}

function sessionLabel(item: AbsenceToNotify, LABELS: ReturnType<typeof useLabels>, locale: Locale): string {
  const date = formatDateWithWeekday(item.sessionDate, locale);
  const time = item.startTime && item.endTime ? `${item.startTime} – ${item.endTime}` : item.startTime;
  return LABELS.absenceAlerts.session(date.charAt(0).toUpperCase() + date.slice(1), time);
}

// ---------------------------------------------------------------------
// Bloc du tableau de bord
// ---------------------------------------------------------------------
export function AbsenceAlertsBlock({ items, fileBase }: { items: AbsenceToNotify[]; fileBase: string }) {
  const LABELS = useLabels();
  const A = LABELS.absenceAlerts;
  const pending = items.filter((item) => !item.notifiedAt);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-caption text-muted-foreground">{A.description}</p>
        <NotifyAllDialog items={pending} />
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl bg-muted px-4 py-6 text-center text-muted-foreground">{A.emptyDescription}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-divider">
          {items.map((item) => (
            <AbsenceRow key={item.attendanceId} item={item} fileBase={fileBase} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AbsenceRow({ item, fileBase }: { item: AbsenceToNotify; fileBase: string }) {
  const LABELS = useLabels();
  const A = LABELS.absenceAlerts;
  const locale = useLocale();
  const notified = Boolean(item.notifiedAt);

  return (
    <li className={cn("flex flex-col gap-3 py-4 first:pt-0 last:pb-0 lg:flex-row lg:items-center", notified && "opacity-70")}>
      <Link href={`${fileBase}/${item.studentId}?onglet=absences`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg">
        <StudentAvatar name={item.fullName} photoUrl={item.photoUrl} />
        <span className="flex min-w-0 flex-col">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium text-heading">{item.fullName}</span>
            {item.inSeries ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-caption font-medium text-danger-ink" title={A.seriesHint}>
                <BellRing className="size-3" aria-hidden />
                {A.series}
              </span>
            ) : null}
          </span>
          <span className="truncate text-caption text-muted-foreground">
            {item.subjectName} · {sessionLabel(item, LABELS, locale)}
            {item.teacherName ? ` · ${item.teacherName}` : ""}
          </span>
          <span className="truncate text-caption text-muted-foreground">
            {A.guardian(item.guardianName, item.guardianPhone ? formatPhone(item.guardianPhone) : null)}
          </span>
          {notified && item.notifiedAt && item.notifiedChannel ? (
            <span className="text-caption font-medium text-success-ink">
              {A.notifiedVia(A.channels[item.notifiedChannel], formatDateTime(item.notifiedAt), item.notifiedBy)}
            </span>
          ) : null}
        </span>
      </Link>
      <NotifyActions item={item} />
    </li>
  );
}

/** Boutons d'une absence : WhatsApp (ou relance), appel, en personne. */
export function NotifyActions({ item, compact = false }: { item: AbsenceToNotify; compact?: boolean }) {
  const LABELS = useLabels();
  const A = LABELS.absenceAlerts;
  const { send, pending } = useNotify();
  const [askPhone, setAskPhone] = useState(false);
  const notified = Boolean(item.notifiedAt);

  const whatsapp = () => {
    if (!item.guardianPhone) {
      setAskPhone(true);
      return;
    }
    void send({ attendanceId: item.attendanceId, channel: "whatsapp", repeat: notified });
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <Button variant={notified ? "outline" : "success"} onClick={whatsapp} disabled={pending} className={cn(compact && "h-9")}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <MessageCircle aria-hidden />}
        {notified ? A.notifyAgain : A.notify}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" disabled={pending} className={cn(compact && "h-9")}>
            {A.otherChannel}
            <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void send({ attendanceId: item.attendanceId, channel: "phone_call", repeat: notified })}>
            <Phone aria-hidden />
            {A.recordCall}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void send({ attendanceId: item.attendanceId, channel: "in_person", repeat: notified })}>
            <UserCheck aria-hidden />
            {A.recordInPerson}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PhoneDialog
        open={askPhone}
        onOpenChange={setAskPhone}
        pending={pending}
        onSubmit={async (phone) => {
          const ok = await send({ attendanceId: item.attendanceId, channel: "whatsapp", phone, repeat: notified });
          if (ok) setAskPhone(false);
        }}
      />
    </div>
  );
}

function PhoneDialog({
  open,
  onOpenChange,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onSubmit: (phone: string) => void;
}) {
  const LABELS = useLabels();
  const S = LABELS.receipts.share;
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value);
        if (value) {
          setPhone("");
          setError(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!isValidPhone(phone)) {
              setError(S.phoneInvalid);
              return;
            }
            onSubmit(phone);
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-section">{LABELS.absenceAlerts.notify}</DialogTitle>
            <DialogDescription>{LABELS.absenceAlerts.noPhone}</DialogDescription>
          </DialogHeader>
          <FormField id="absence-telephone" label={S.phone} error={error ?? undefined}>
            <Input type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="06 12 34 56 78" />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              {LABELS.common.cancel}
            </Button>
            <Button type="submit" variant="success" disabled={pending}>
              {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <MessageCircle aria-hidden />}
              {S.send}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// « Tout prévenir » : les absences une par une, sans revenir au tableau de bord
// ---------------------------------------------------------------------
function NotifyAllDialog({ items }: { items: AbsenceToNotify[] }) {
  const LABELS = useLabels();
  const A = LABELS.absenceAlerts;
  const locale = useLocale();
  const Q = A.sequence;
  const { send, pending } = useNotify();
  const [open, setOpen] = useState(false);
  // Liste figée à l'ouverture : l'actualisation de la page ne la modifie pas.
  const [queue, setQueue] = useState<AbsenceToNotify[]>([]);
  const [index, setIndex] = useState(0);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const current = queue[index];

  const next = () => {
    setIndex((value) => value + 1);
    setPhone("");
    setPhoneError(null);
  };

  const sendCurrent = async (channel: NotificationChannel) => {
    if (!current) return;
    let entered: string | undefined;
    if (channel === "whatsapp" && !current.guardianPhone) {
      if (!isValidPhone(phone)) {
        setPhoneError(LABELS.receipts.share.phoneInvalid);
        return;
      }
      entered = phone;
    }
    if (await send({ attendanceId: current.attendanceId, channel, phone: entered })) next();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Toujours monté : la file continue quand la liste se réduit après chaque envoi. */}
      {items.length > 1 || open ? (
        <Button
          variant="success"
          onClick={() => {
            setQueue(items);
            setIndex(0);
            setPhone("");
            setPhoneError(null);
            setOpen(true);
          }}
        >
          <Users aria-hidden />
          {A.notifyAll(items.length)}
        </Button>
      ) : null}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-section">{Q.title}</DialogTitle>
          <DialogDescription>{current ? Q.progress(index + 1, queue.length) : Q.done}</DialogDescription>
        </DialogHeader>

        {current ? (
          <div className="flex flex-col gap-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(index / queue.length) * 100}%` }} />
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-muted px-4 py-3">
              <StudentAvatar name={current.fullName} photoUrl={current.photoUrl} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {current.fullName}
                  {current.inSeries ? <span className="text-caption font-medium text-danger-ink">{A.series}</span> : null}
                </span>
                <span className="text-caption text-muted-foreground">
                  {current.subjectName} · {sessionLabel(current, LABELS, locale)}
                </span>
                <span className="text-caption text-muted-foreground">
                  {A.guardian(current.guardianName, current.guardianPhone ? formatPhone(current.guardianPhone) : null)}
                </span>
              </div>
            </div>
            {!current.guardianPhone ? (
              <FormField id="sequence-telephone" label={LABELS.receipts.share.phone} hint={A.noPhone} error={phoneError ?? undefined}>
                <Input type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="06 12 34 56 78" />
              </FormField>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="success" disabled={pending} onClick={() => void sendCurrent("whatsapp")}>
                {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <MessageCircle aria-hidden />}
                {Q.open}
              </Button>
              <Button variant="outline" disabled={pending} onClick={() => void sendCurrent("phone_call")}>
                <Phone aria-hidden />
                {A.recordCall}
              </Button>
            </div>
            <Button variant="ghost" className="self-start" disabled={pending} onClick={next}>
              <SkipForward aria-hidden />
              {Q.skip}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-success/15 text-success-ink">
              <Check className="size-6" aria-hidden />
            </span>
            <p>{Q.done}</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {Q.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Statut de notification d'une absence (fiche d'assiduité). */
export function AbsenceNotificationStatus({ item }: { item: AbsenceToNotify | null }) {
  const LABELS = useLabels();
  const A = LABELS.absenceAlerts;
  if (!item) return null;
  return item.notifiedAt && item.notifiedChannel ? (
    <span className="text-caption font-medium text-success-ink">
      {A.notifiedVia(A.channels[item.notifiedChannel], formatDate(item.notifiedAt), item.notifiedBy)}
    </span>
  ) : (
    <span className="text-caption font-medium text-warning-ink">{A.notNotified}</span>
  );
}
