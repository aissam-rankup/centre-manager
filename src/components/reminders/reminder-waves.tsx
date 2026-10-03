"use client";

import Link from "next/link";
import { useState } from "react";

import { ReminderActions, SendAllRemindersDialog } from "@/components/reminders/reminder-actions";
import { Money } from "@/components/shared/money";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { formatDate } from "@/lib/format";
import { useLabels } from "@/lib/i18n/client";
import {
  REMINDER_TYPES,
  type ReminderItem,
  reminderKey,
  reminderStatus,
  reminderSuggestedFrom,
  reminderToSend,
  type ReminderType,
} from "@/lib/reminders";
import { cn } from "@/lib/utils";

type ReminderWavesProps = {
  items: ReminderItem[];
  daysBefore: number;
  fileBase: string;
};

/** Rappels de la campagne par vague : avant échéance, le jour même, en retard ; envoi un par un ou en file. */
export function ReminderWaves({ items, daysBefore, fileBase }: ReminderWavesProps) {
  const LABELS = useLabels();
  const R = LABELS.reenrollment.reminders;
  const byType = (type: ReminderType) => items.filter((item) => item.type === type);
  const [wave, setWave] = useState<ReminderType>(
    byType("overdue").length > 0 ? "overdue" : byType("due_today").length > 0 ? "due_today" : "upcoming",
  );
  const visible = byType(wave);
  const toSend = visible.filter(reminderToSend);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="group" aria-label={R.waveLabel} className="-mx-4 overflow-x-auto px-4 no-scrollbar md:mx-0 md:px-0">
          <ul className="flex w-max gap-2">
            {REMINDER_TYPES.map((type) => {
              const active = type === wave;
              return (
                <li key={type}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setWave(type)}
                    className={cn(
                      "inline-flex h-11 items-center rounded-full border px-4 font-medium whitespace-nowrap transition-colors",
                      active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                      !active && type === "overdue" && byType(type).length > 0 && "text-danger-ink",
                    )}
                  >
                    {R.waveTab(R.waves[type], byType(type).length)}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <SendAllRemindersDialog items={toSend} />
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl bg-muted px-4 py-6 text-center text-muted-foreground">{R.empty[wave]}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-divider">
          {visible.map((item) => (
            <ReminderRow key={reminderKey(item)} item={item} daysBefore={daysBefore} fileBase={fileBase} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Un rappel : élève, montant, matières, échéance ou retard, dernier envoi, boutons. */
export function ReminderRow({ item, daysBefore, fileBase }: { item: ReminderItem; daysBefore: number; fileBase: string }) {
  const LABELS = useLabels();
  const R = LABELS.reenrollment.reminders;
  const status = reminderStatus(item, LABELS);
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 lg:flex-row lg:items-center">
      <Link href={`${fileBase}/${item.studentId}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg">
        <StudentAvatar name={item.fullName} photoUrl={item.photoUrl} status={item.type === "overdue" ? "overdue" : "neutral"} />
        <span className="flex min-w-0 flex-col">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="truncate font-medium text-heading">{item.fullName}</span>
            <Money amount={item.amountDue} />
          </span>
          <span className="truncate text-caption text-muted-foreground">
            {item.subjectNames.join(", ")} · {R.due(formatDate(item.dueDate))}
          </span>
          {item.type === "overdue" && item.daysOverdue !== null ? (
            <span className="text-caption font-medium text-danger-ink">{R.late(R.days(item.daysOverdue))}</span>
          ) : null}
          {!item.suggested ? (
            <span className="text-caption text-muted-foreground">{R.later(formatDate(reminderSuggestedFrom(item.dueDate, daysBefore)))}</span>
          ) : null}
          <span className={cn("text-caption font-medium", status.done ? "text-success-ink" : "text-muted-foreground")}>{status.text}</span>
        </span>
      </Link>
      <ReminderActions item={item} />
    </li>
  );
}
