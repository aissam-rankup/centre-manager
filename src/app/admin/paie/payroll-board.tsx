"use client";

import { Banknote, ChevronDown, FileText, Info, Lock, LockOpen, SlidersHorizontal } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormDialog } from "@/components/admin/form-dialog";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { markPayrollLinePaid, setPayrollAdjustment, unlockPayroll, validatePayroll } from "@/lib/actions/payroll";
import { ROUTES } from "@/lib/auth/routes";
import type { PayrollLineView, PayrollView } from "@/lib/data/payroll";
import { formatDate, formatMAD, formatMonth } from "@/lib/format";
import { useLabels, useLocale, useMessage } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/locale";
import { formatRate, monthKey, type PayrollMonth } from "@/lib/payroll";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/receipts";
import { cn } from "@/lib/utils";

const STATUS_TONE = {
  draft: "bg-muted text-muted-foreground",
  validated: "bg-primary-soft text-primary",
  paid: "bg-success/15 text-success-ink",
} as const;

/** Montant signé : « + 300 MAD » / « − 200 MAD ». */
function signedMAD(amount: number): string {
  if (amount === 0) return formatMAD(0);
  return `${amount > 0 ? "+" : "−"} ${formatMAD(Math.abs(amount))}`;
}

/** Mois affiché (« Octobre 2026 ») dans la langue de l'utilisateur. */
function payrollMonthLabel(value: PayrollMonth, locale: Locale): string {
  const label = formatMonth(`${monthKey(value)}-01`, locale);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function PayrollActions({ payroll }: { payroll: PayrollView }) {
  const LABELS = useLabels();
  const P = LABELS.payroll;
  const month = payrollMonthLabel(payroll.month, useLocale());
  const anyPaid = payroll.lines.some((line) => line.paidAt);
  const exportBase = `${ROUTES.admin.payroll}/export?mois=${monthKey(payroll.month)}`;

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <span className={cn("w-fit rounded-full px-2.5 py-0.5 text-caption font-semibold", STATUS_TONE[payroll.status])}>
          {P.status[payroll.status]}
        </span>
        <p className="text-caption text-muted-foreground">{P.statusHints[payroll.status]}</p>
        {payroll.validatedAt ? (
          <p className="text-caption text-muted-foreground">
            {payroll.validatedByName
              ? P.validatedBy(payroll.validatedByName, formatDate(payroll.validatedAt))
              : P.validatedOn(formatDate(payroll.validatedAt))}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {payroll.status === "draft" && payroll.lines.length > 0 ? (
          <ConfirmAction
            variant="default"
            trigger={
              <Button>
                <Lock aria-hidden />
                {P.validate.trigger}
              </Button>
            }
            title={P.validate.title(month)}
            description={P.validate.description}
            confirmLabel={P.validate.confirm}
            successMessage={P.validate.done}
            action={() => validatePayroll(payroll.periodId)}
          />
        ) : null}
        {payroll.status === "validated" && !anyPaid ? <UnlockDialog periodId={payroll.periodId} /> : null}
        <Button asChild variant="outline">
          <a href={`${exportBase}&format=pdf`} target="_blank" rel="noopener">
            <FileText aria-hidden />
            {P.exports.summaryPdf}
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href={`${exportBase}&format=csv`} download>
            <FileText aria-hidden />
            {P.exports.summaryCsv}
          </a>
        </Button>
      </div>
    </div>
  );
}

function UnlockDialog({ periodId }: { periodId: string }) {
  const LABELS = useLabels();
  const U = LABELS.payroll.unlock;
  const message = useMessage();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <FormDialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setReason("");
          setError(null);
        }
      }}
      title={U.title}
      description={U.description}
      pending={pending}
      error={error}
      submitLabel={U.confirm}
      onSubmit={(event) => {
        event.preventDefault();
        if (!reason.trim()) {
          setError(U.reasonRequired);
          return;
        }
        startTransition(async () => {
          const result = await unlockPayroll({ periodId, reason });
          if (!result.ok) {
            setError(message(result.error));
            return;
          }
          toast.success(U.done);
          setOpen(false);
        });
      }}
      trigger={
        <Button variant="outline">
          <LockOpen aria-hidden />
          {U.trigger}
        </Button>
      }
    >
      <FormField id={`deverrouillage-${periodId}`} label={U.reason}>
        <Textarea rows={3} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} />
      </FormField>
    </FormDialog>
  );
}

export function PayrollBoard({ payroll, todayIso }: { payroll: PayrollView; todayIso: string }) {
  const LABELS = useLabels();
  const P = LABELS.payroll;
  const C = P.columns;

  return (
    <section aria-label={P.title} className="overflow-hidden rounded-xl bg-card shadow-card">
      <div className="hidden grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_minmax(0,1.4fr)] gap-4 border-b border-divider px-5 py-3 text-caption font-medium text-muted-foreground lg:grid">
        <span>{C.teacher}</span>
        <span className="text-end">{C.computed}</span>
        <span className="text-end">{C.adjustment}</span>
        <span className="text-end">{C.final}</span>
        <span>{C.payment}</span>
        <span />
      </div>
      <ul className="divide-y divide-divider">
        {payroll.lines.map((line) => (
          <PayrollLineRow key={line.id} line={line} payroll={payroll} todayIso={todayIso} />
        ))}
      </ul>
      <div className="flex items-baseline justify-between gap-4 border-t-2 border-divider bg-muted/40 px-5 py-4">
        <span className="font-semibold">
          {P.total} <span className="text-caption font-normal text-muted-foreground">· {P.teachersCount(payroll.lines.length)}</span>
        </span>
        <span className="numeric text-section text-heading">{formatMAD(payroll.total)}</span>
      </div>
    </section>
  );
}

function PayrollLineRow({ line, payroll, todayIso }: { line: PayrollLineView; payroll: PayrollView; todayIso: string }) {
  const LABELS = useLabels();
  const P = LABELS.payroll;
  const C = P.columns;
  const [open, setOpen] = useState(false);
  const mode = line.payMode ? P.modes[line.payMode] : P.modes.none;

  return (
    <li className="flex flex-col">
      <div className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_minmax(0,1.4fr)] lg:items-center lg:gap-4">
        <div className="flex min-w-0 flex-col">
          <span className="font-medium">{line.teacherName}</span>
          <span className={cn("text-caption", line.payMode ? "text-muted-foreground" : "font-medium text-warning-ink")}>{mode}</span>
        </div>
        <Amount label={C.computed} value={formatMAD(line.computed)} />
        <div className="flex justify-between gap-3 lg:flex-col lg:items-end lg:gap-0">
          <span className="text-caption text-muted-foreground lg:hidden">{C.adjustment}</span>
          <span className="flex flex-col items-end">
            <span className={cn("numeric", line.adjustment > 0 && "text-success-ink", line.adjustment < 0 && "text-danger-ink")}>
              {line.adjustment === 0 ? LABELS.common.none : signedMAD(line.adjustment)}
            </span>
            {line.adjustmentReason ? (
              <span className="max-w-48 truncate text-caption text-muted-foreground" title={line.adjustmentReason}>
                {line.adjustmentReason}
              </span>
            ) : null}
          </span>
        </div>
        <Amount label={C.final} value={formatMAD(line.final)} strong />
        <div className="flex justify-between gap-3 lg:block">
          <span className="text-caption text-muted-foreground lg:hidden">{C.payment}</span>
          <span className={cn("text-caption font-medium", line.paidAt ? "text-success-ink" : "text-muted-foreground")}>
            {line.paidAt && line.paymentMethod
              ? P.paidOn(formatDate(line.paidAt), LABELS.paymentMethods[line.paymentMethod])
              : payroll.status === "draft"
                ? P.notYet
                : P.notPaid}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {payroll.status === "draft" ? <AdjustmentDialog line={line} /> : null}
          {payroll.status !== "draft" && !line.paidAt ? <PayLineDialog line={line} todayIso={todayIso} /> : null}
          <Button asChild variant="ghost" aria-label={`${P.exports.payslip} — ${line.teacherName}`}>
            <a href={`${ROUTES.admin.payroll}/fiche/${line.id}`} target="_blank" rel="noopener">
              <FileText aria-hidden />
              <span className="lg:sr-only">{P.exports.payslip}</span>
            </a>
          </Button>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex items-center gap-1.5 px-5 pb-3 text-caption font-medium text-primary hover:underline"
      >
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
        {open ? P.hideDetail : P.showDetail}
      </button>
      {open ? <PayrollDetailPanel line={line} /> : null}
    </li>
  );
}

function Amount({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 lg:block lg:text-end">
      <span className="text-caption text-muted-foreground lg:hidden">{label}</span>
      <span className={cn("numeric", strong ? "font-semibold text-heading" : "font-normal")}>{value}</span>
    </div>
  );
}

function PayrollDetailPanel({ line }: { line: PayrollLineView }) {
  const LABELS = useLabels();
  const locale = useLocale();
  const D = LABELS.payroll.detail;
  const detail = line.detail;

  return (
    <div className="mx-5 mb-4 flex flex-col gap-3 rounded-xl bg-muted px-4 py-3">
      {detail.kind === "commission" ? (
        detail.subjects.length === 0 ? (
          <p className="text-muted-foreground">{D.noSubjects}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-table">
                <caption className="sr-only">{LABELS.payroll.showDetail}</caption>
                <thead>
                  <tr className="text-start text-caption text-muted-foreground">
                    <th className="py-1.5 pe-3 font-medium">{D.subject}</th>
                    <th className="py-1.5 pe-3 font-medium">{D.level}</th>
                    <th className="py-1.5 pe-3 text-end font-medium">{D.price}</th>
                    <th className="py-1.5 pe-3 text-end font-medium">{D.enrolled}</th>
                    <th className="py-1.5 pe-3 text-end font-medium">{D.rate}</th>
                    <th className="py-1.5 text-end font-medium">{D.subtotal}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.subjects.map((subject) => (
                    <tr key={subject.subjectId} className="border-t border-divider">
                      <td className="py-2 pe-3 font-medium">{subject.subject}</td>
                      <td className="py-2 pe-3 text-muted-foreground">{subject.level}</td>
                      <td className="numeric py-2 pe-3 text-end font-normal">{formatMAD(subject.monthlyPrice)}</td>
                      <td className="numeric py-2 pe-3 text-end font-normal">{subject.enrolled}</td>
                      <td className="numeric py-2 pe-3 text-end font-normal">
                        {subject.ratePercent === null ? <span className="text-warning-ink">{D.noRate}</span> : formatRate(subject.ratePercent, locale)}
                      </td>
                      <td className="numeric py-2 text-end font-semibold">
                        {formatMAD(subject.subtotal)}
                        {subject.ratePercent !== null ? (
                          <span className="block text-caption font-normal text-muted-foreground">
                            {D.formula(formatMAD(subject.monthlyPrice), subject.enrolled, formatRate(subject.ratePercent, locale), formatMAD(subject.subtotal))}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="flex items-start gap-1.5 text-caption text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {D.fullPriceNote}
            </p>
          </>
        )
      ) : detail.kind === "fixed_salary" ? (
        <p>
          {detail.monthlyAmount !== null && detail.effectiveFrom
            ? D.salary(formatMAD(detail.monthlyAmount), formatDate(detail.effectiveFrom))
            : D.noSalary}
        </p>
      ) : (
        <p className="text-warning-ink">{D.notConfigured}</p>
      )}
    </div>
  );
}

function AdjustmentDialog({ line }: { line: PayrollLineView }) {
  const LABELS = useLabels();
  const A = LABELS.payroll.adjustment;
  const message = useMessage();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"bonus" | "deduction">(line.adjustment < 0 ? "deduction" : "bonus");
  const [amount, setAmount] = useState(line.adjustment === 0 ? "" : String(Math.abs(line.adjustment)));
  const [reason, setReason] = useState(line.adjustmentReason ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (value: number, text: string) => {
    startTransition(async () => {
      const result = await setPayrollAdjustment({ lineId: line.id, amount: value, reason: text });
      if (!result.ok) {
        setError(message(result.error));
        return;
      }
      toast.success(A.saved);
      setOpen(false);
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setKind(line.adjustment < 0 ? "deduction" : "bonus");
          setAmount(line.adjustment === 0 ? "" : String(Math.abs(line.adjustment)));
          setReason(line.adjustmentReason ?? "");
          setError(null);
        }
      }}
      title={A.title(line.teacherName)}
      description={A.description}
      pending={pending}
      error={error}
      onSubmit={(event) => {
        event.preventDefault();
        const value = Number(amount.replace(",", "."));
        if (!Number.isFinite(value) || value <= 0) {
          setError(LABELS.payroll.settings.invalidAmount);
          return;
        }
        if (!reason.trim()) {
          setError(A.reasonRequired);
          return;
        }
        save(kind === "bonus" ? value : -value, reason);
      }}
      trigger={
        <Button variant="outline">
          <SlidersHorizontal aria-hidden />
          {A.trigger}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={`ajustement-type-${line.id}`} label={A.kind}>
          <NativeSelect value={kind} onChange={(event) => setKind(event.target.value === "deduction" ? "deduction" : "bonus")}>
            <option value="bonus">{A.kinds.bonus}</option>
            <option value="deduction">{A.kinds.deduction}</option>
          </NativeSelect>
        </FormField>
        <FormField id={`ajustement-montant-${line.id}`} label={A.amount}>
          <Input type="number" inputMode="decimal" min={0} step={50} value={amount} onChange={(event) => setAmount(event.target.value)} className="numeric font-normal" />
        </FormField>
      </div>
      <FormField id={`ajustement-motif-${line.id}`} label={A.reason}>
        <Input maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} />
      </FormField>
      {line.adjustment !== 0 ? (
        <Button type="button" variant="ghost" className="self-start text-danger-ink" disabled={pending} onClick={() => save(0, "")}>
          {A.remove}
        </Button>
      ) : null}
    </FormDialog>
  );
}

function PayLineDialog({ line, todayIso }: { line: PayrollLineView; todayIso: string }) {
  const LABELS = useLabels();
  const Y = LABELS.payroll.pay;
  const message = useMessage();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayIso);
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <FormDialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setDate(todayIso);
          setError(null);
        }
      }}
      title={Y.title(line.teacherName)}
      pending={pending}
      error={error}
      submitLabel={Y.confirm}
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await markPayrollLinePaid({ lineId: line.id, paidAt: date, method });
          if (!result.ok) {
            setError(message(result.error));
            return;
          }
          toast.success(Y.done);
          setOpen(false);
        });
      }}
      trigger={
        <Button variant="success">
          <Banknote aria-hidden />
          {Y.trigger}
        </Button>
      }
    >
      <p className="flex items-baseline justify-between rounded-xl bg-muted px-4 py-3">
        <span>{Y.amount}</span>
        <span className="numeric text-section text-heading">{formatMAD(line.final)}</span>
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={`versement-date-${line.id}`} label={Y.date}>
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="numeric font-normal" />
        </FormField>
        <FormField id={`versement-mode-${line.id}`} label={Y.method}>
          <NativeSelect value={method} onChange={(event) => setMethod(PAYMENT_METHODS.find((value) => value === event.target.value) ?? "bank_transfer")}>
            {PAYMENT_METHODS.map((value) => (
              <option key={value} value={value}>
                {LABELS.paymentMethods[value]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
    </FormDialog>
  );
}
