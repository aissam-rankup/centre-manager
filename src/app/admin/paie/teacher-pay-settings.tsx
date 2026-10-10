"use client";

import { History, Pencil } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormDialog } from "@/components/admin/form-dialog";
import { FormField } from "@/components/shared/form-field";
import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveTeacherPay } from "@/lib/actions/payroll";
import type { PayHistoryEntry, TeacherPaySettings } from "@/lib/data/payroll";
import { formatDate, formatMAD } from "@/lib/format";
import { useLabels, useMessage } from "@/lib/i18n/client";
import { formatRate, PAY_MODES, type PayMode } from "@/lib/payroll";
import { cn } from "@/lib/utils";

export function TeacherPaySettingsSection({ teachers, defaultFrom }: { teachers: TeacherPaySettings[]; defaultFrom: string }) {
  const LABELS = useLabels();
  const S = LABELS.payroll.settings;

  return (
    <SectionCard id="remuneration" title={S.title} description={S.description}>
      <ul className="flex flex-col divide-y">
        {teachers.map((teacher) => {
          const rated = teacher.subjects.filter((subject) => subject.currentRate !== null);
          const summary =
            teacher.payMode === "fixed_salary"
              ? teacher.currentSalary !== null
                ? S.current.salary(formatMAD(teacher.currentSalary))
                : S.current.none
              : teacher.payMode === "commission"
                ? rated.map((subject) => `${subject.subject} (${subject.level}) ${formatRate(subject.currentRate ?? 0)}`).join(" · ") ||
                  S.current.none
                : S.current.none;
          return (
            <li key={teacher.teacherId} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-col">
                <span className="font-medium">{teacher.teacherName}</span>
                <span className="text-caption text-muted-foreground">
                  {teacher.payMode ? LABELS.payroll.modes[teacher.payMode] : LABELS.payroll.modes.none}
                </span>
                <span className={cn("text-caption", summary === S.current.none ? "font-medium text-warning-ink" : "text-muted-foreground")}>
                  {summary}
                </span>
              </div>
              <TeacherPayDialog teacher={teacher} defaultFrom={defaultFrom} />
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

function HistoryList({ entries, format }: { entries: PayHistoryEntry[]; format: (value: number) => string }) {
  const LABELS = useLabels();
  const S = LABELS.payroll.settings;
  if (entries.length === 0) return null;
  return (
    <ul className="flex flex-col gap-0.5 text-caption text-muted-foreground">
      {entries.map((entry) => (
        <li key={entry.from}>
          {format(entry.value)} —{" "}
          {entry.to ? S.historyRange(formatDate(entry.from), formatDate(entry.to)) : S.historyFrom(formatDate(entry.from))}
        </li>
      ))}
    </ul>
  );
}

function TeacherPayDialog({ teacher, defaultFrom }: { teacher: TeacherPaySettings; defaultFrom: string }) {
  const LABELS = useLabels();
  const P = LABELS.payroll;
  const S = P.settings;
  const message = useMessage();
  const initialRates = () =>
    Object.fromEntries(teacher.subjects.map((subject) => [subject.subjectId, subject.currentRate === null ? "" : String(subject.currentRate)]));

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PayMode>(teacher.payMode ?? "commission");
  const [amount, setAmount] = useState(teacher.currentSalary === null ? "" : String(teacher.currentSalary));
  const [rates, setRates] = useState<Record<string, string>>(initialRates);
  const [from, setFrom] = useState(defaultFrom);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showHistory, setShowHistory] = useState(false);

  const reset = () => {
    setMode(teacher.payMode ?? "commission");
    setAmount(teacher.currentSalary === null ? "" : String(teacher.currentSalary));
    setRates(initialRates());
    setFrom(defaultFrom);
    setError(null);
    setShowHistory(false);
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const toNumber = (value: string) => Number(value.replace(",", "."));
    let monthlyAmount: number | null = null;
    if (mode === "fixed_salary") {
      monthlyAmount = toNumber(amount);
      if (amount.trim() === "" || !Number.isFinite(monthlyAmount) || monthlyAmount < 0) {
        setError(S.invalidAmount);
        return;
      }
    }
    const entries = mode === "commission" ? Object.entries(rates).filter(([, value]) => value.trim() !== "") : [];
    const parsedRates = entries.map(([subjectId, value]) => ({ subjectId, ratePercent: toNumber(value) }));
    if (parsedRates.some((rate) => !Number.isFinite(rate.ratePercent) || rate.ratePercent < 0 || rate.ratePercent > 100)) {
      setError(S.invalidRate);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await saveTeacherPay({ teacherId: teacher.teacherId, payMode: mode, effectiveFrom: from, monthlyAmount, rates: parsedRates });
      if (!result.ok) {
        setError(message(result.error));
        return;
      }
      toast.success(S.saved);
      setOpen(false);
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) reset();
      }}
      title={S.dialogTitle(teacher.teacherName)}
      pending={pending}
      error={error}
      onSubmit={onSubmit}
      trigger={
        <Button variant="outline">
          <Pencil aria-hidden />
          {S.edit}
        </Button>
      }
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-table font-medium">{S.mode}</legend>
        <div className="grid grid-cols-2 gap-2">
          {PAY_MODES.map((value) => (
            <label
              key={value}
              className={cn(
                "flex h-10 cursor-pointer items-center justify-center rounded-lg border text-table font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                mode === value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              <input type="radio" name={`mode-${teacher.teacherId}`} value={value} checked={mode === value} onChange={() => setMode(value)} className="sr-only" />
              {P.modes[value]}
            </label>
          ))}
        </div>
      </fieldset>

      {mode === "fixed_salary" ? (
        <FormField id={`salaire-${teacher.teacherId}`} label={S.monthlyAmount}>
          <Input type="number" inputMode="decimal" min={0} step={100} value={amount} onChange={(event) => setAmount(event.target.value)} className="numeric font-normal" />
        </FormField>
      ) : teacher.subjects.length === 0 ? (
        <p className="text-warning-ink">{S.noAssignment}</p>
      ) : (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-table font-medium">{S.rates}</legend>
          {teacher.subjects.map((subject) => (
            <div key={subject.subjectId} className="flex items-end justify-between gap-3">
              <label htmlFor={`taux-${teacher.teacherId}-${subject.subjectId}`} className="min-w-0 flex-1 pb-2">
                {S.rateFor(subject.subject, subject.level)}
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id={`taux-${teacher.teacherId}-${subject.subjectId}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step={1}
                  aria-label={`${S.ratePercent} — ${subject.subject}`}
                  value={rates[subject.subjectId] ?? ""}
                  onChange={(event) => setRates((current) => ({ ...current, [subject.subjectId]: event.target.value }))}
                  className="numeric w-24 font-normal"
                />
                <span className="text-muted-foreground">%</span>
              </div>
            </div>
          ))}
        </fieldset>
      )}

      <FormField id={`effet-${teacher.teacherId}`} label={S.effectiveFrom} hint={S.effectiveFromHint}>
        <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="numeric font-normal" />
      </FormField>

      {teacher.salaryHistory.length > 0 || teacher.subjects.some((subject) => subject.history.length > 0) ? (
        <div className="flex flex-col gap-2">
          <Button type="button" variant="ghost" className="self-start" onClick={() => setShowHistory((value) => !value)} aria-expanded={showHistory}>
            <History aria-hidden />
            {S.history}
          </Button>
          {showHistory ? (
            <div className="flex flex-col gap-2 rounded-xl bg-muted px-4 py-3">
              {teacher.salaryHistory.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <span className="text-caption font-medium">{P.modes.fixed_salary}</span>
                  <HistoryList entries={teacher.salaryHistory} format={formatMAD} />
                </div>
              ) : null}
              {teacher.subjects
                .filter((subject) => subject.history.length > 0)
                .map((subject) => (
                  <div key={subject.subjectId} className="flex flex-col gap-1">
                    <span className="text-caption font-medium">{S.rateFor(subject.subject, subject.level)}</span>
                    <HistoryList entries={subject.history} format={formatRate} />
                  </div>
                ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </FormDialog>
  );
}
