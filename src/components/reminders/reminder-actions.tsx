"use client";

import { Check, ChevronDown, LoaderCircle, MessageCircle, Phone, SkipForward, UserCheck, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/shared/form-field";
import { Money } from "@/components/shared/money";
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
import type { NotificationChannel } from "@/lib/absences";
import { sendPaymentReminder } from "@/lib/actions/reminders";
import { formatDate } from "@/lib/format";
import { useLabels } from "@/lib/i18n/client";
import { formatPhone, isValidPhone } from "@/lib/phone";
import type { ReminderItem } from "@/lib/reminders";
import { cn } from "@/lib/utils";

type Send = (item: ReminderItem, channel: NotificationChannel, phone?: string) => Promise<boolean>;

/**
 * Envoi d'un rappel : pour WhatsApp, la fenêtre est ouverte pendant le clic
 * (sinon bloquée) puis dirigée vers le message pré-rempli.
 */
function useSendReminder(): { send: Send; pending: boolean } {
  const LABELS = useLabels();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const send: Send = (item, channel, phone) =>
    new Promise((resolve) => {
      const target = channel === "whatsapp" ? window.open("about:blank", "_blank") : null;
      startTransition(async () => {
        const result = await sendPaymentReminder({
          runId: item.runId,
          studentId: item.studentId,
          dueDate: item.dueDate,
          channel,
          phone,
          repeat: Boolean(item.lastSentAt),
        });
        if (!result.ok) {
          target?.close();
          toast.error(result.error);
          resolve(false);
          return;
        }
        if (result.data.href) {
          if (target) target.location.href = result.data.href;
          else window.location.assign(result.data.href);
        }
        toast.success(LABELS.reenrollment.reminders.recorded);
        router.refresh();
        resolve(true);
      });
    });

  return { send, pending };
}

/** Boutons d'un rappel : WhatsApp (ou relance), appel passé, vu en personne. */
export function ReminderActions({ item }: { item: ReminderItem }) {
  const LABELS = useLabels();
  const R = LABELS.reenrollment.reminders;
  const { send, pending } = useSendReminder();
  const [askPhone, setAskPhone] = useState(false);
  const sent = Boolean(item.lastSentAt);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <Button
        variant={sent ? "outline" : "success"}
        className="min-h-11"
        disabled={pending}
        onClick={() => (item.guardianPhone ? void send(item, "whatsapp") : setAskPhone(true))}
      >
        {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <MessageCircle aria-hidden />}
        {sent ? R.sendAgain : R.send}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="min-h-11" disabled={pending}>
            {R.otherChannel}
            <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem className="min-h-11" onSelect={() => void send(item, "phone_call")}>
            <Phone aria-hidden />
            {R.recordCall}
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-11" onSelect={() => void send(item, "in_person")}>
            <UserCheck aria-hidden />
            {R.recordInPerson}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PhoneDialog
        open={askPhone}
        onOpenChange={setAskPhone}
        pending={pending}
        onSubmit={async (phone) => {
          if (await send(item, "whatsapp", phone)) setAskPhone(false);
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
  const R = LABELS.reenrollment.reminders;
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
            <DialogTitle className="text-section">{R.send}</DialogTitle>
            <DialogDescription>{R.noPhone}</DialogDescription>
          </DialogHeader>
          <FormField id="rappel-telephone" label={S.phone} error={error ?? undefined}>
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

/** « Tout envoyer » : les tuteurs un par un, dans une file figée à l'ouverture. */
export function SendAllRemindersDialog({ items }: { items: ReminderItem[] }) {
  const LABELS = useLabels();
  const R = LABELS.reenrollment.reminders;
  const Q = R.sequence;
  const { send, pending } = useSendReminder();
  const [open, setOpen] = useState(false);
  const [queue, setQueue] = useState<ReminderItem[]>([]);
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
    if (await send(current, channel, entered)) next();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="success"
        className="min-h-11"
        onClick={() => {
          setQueue(items);
          setIndex(0);
          setPhone("");
          setPhoneError(null);
          setOpen(true);
        }}
      >
        <Users aria-hidden />
        {R.sendAll(items.length)}
      </Button>
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
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center justify-between gap-2 font-medium">
                  {current.fullName}
                  <Money amount={current.amountDue} />
                </span>
                <span className="text-caption text-muted-foreground">
                  {current.subjectNames.join(", ")} · {R.due(formatDate(current.dueDate))}
                </span>
                <span className="text-caption text-muted-foreground">
                  {LABELS.absenceAlerts.guardian(current.guardianName, current.guardianPhone ? formatPhone(current.guardianPhone) : null)}
                </span>
              </div>
            </div>
            {!current.guardianPhone ? (
              <FormField id="rappels-telephone" label={LABELS.receipts.share.phone} hint={R.noPhone} error={phoneError ?? undefined}>
                <Input type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="06 12 34 56 78" />
              </FormField>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="success" className="min-h-11" disabled={pending} onClick={() => void sendCurrent("whatsapp")}>
                {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <MessageCircle aria-hidden />}
                {Q.open}
              </Button>
              <Button variant="outline" className="min-h-11" disabled={pending} onClick={() => void sendCurrent("phone_call")}>
                <Phone aria-hidden />
                {R.recordCall}
              </Button>
            </div>
            <Button variant="ghost" className={cn("min-h-11 self-start")} disabled={pending} onClick={next}>
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
          <Button variant="outline" className="min-h-11" onClick={() => setOpen(false)}>
            {Q.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
