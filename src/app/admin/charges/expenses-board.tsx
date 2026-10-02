"use client";

import { Check, LoaderCircle, Paperclip, Pencil, Plus, Repeat, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { FormDialog } from "@/components/admin/form-dialog";
import { ExpenseIcon } from "@/components/expenses/expense-icon";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { FormField } from "@/components/shared/form-field";
import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  addExpense,
  attachExpenseReceipt,
  confirmExpense,
  deleteExpense,
  stopExpenseRecurrence,
  updateExpense,
} from "@/lib/actions/expenses";
import { EXPENSE_RECEIPT_TYPES, type ExpenseCategoryView, type ExpenseView } from "@/lib/expenses";
import { formatDate, formatMAD } from "@/lib/format";
import { useLabels } from "@/lib/i18n/client";
import { PAYMENT_METHODS } from "@/lib/receipts";

import { CategoriesDialog } from "./categories-dialog";

const ACCEPT = Object.keys(EXPENSE_RECEIPT_TYPES).join(",");

type BoardProps = {
  categories: ExpenseCategoryView[];
  expenses: ExpenseView[];
  defaultDate: string;
  total: number;
};

export function ExpensesBoard({ categories, expenses, defaultDate, total }: BoardProps) {
  const drafts = expenses.filter((expense) => expense.status === "draft");
  const confirmed = expenses.filter((expense) => expense.status === "confirmed");
  const byId = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);

  return (
    <div className="flex flex-col gap-6">
      <QuickAddForm categories={categories} defaultDate={defaultDate} />
      {drafts.length > 0 ? <DraftsSection drafts={drafts} categories={byId} /> : null}
      <ExpensesList expenses={confirmed} categories={categories} byId={byId} total={total} />
    </div>
  );
}

// ---------------------------------------------------------------------
// Saisie rapide
// ---------------------------------------------------------------------
function QuickAddForm({ categories: allCategories, defaultDate }: { categories: ExpenseCategoryView[]; defaultDate: string }) {
  const LABELS = useLabels();
  const categories = allCategories.filter((category) => category.isActive);
  const Q = LABELS.expenses.quickAdd;
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [recurring, setRecurring] = useState(false);
  const [pending, startTransition] = useTransition();

  const onCategory = (id: string) => setRecurring(categories.find((category) => category.id === id)?.isRecurring ?? false);

  return (
    <SectionCard title={Q.title} aside={<CategoriesDialog categories={allCategories} />}>
      <form
        ref={formRef}
        noValidate
        className="grid gap-3 sm:grid-cols-2 sm:items-start"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setErrors({});
          startTransition(async () => {
            const result = await addExpense(data);
            if (!result.ok) {
              setErrors(result.fieldErrors ?? {});
              toast.error(result.error);
              return;
            }
            toast.success(Q.added);
            formRef.current?.reset();
            setRecurring(false);
          });
        }}
      >
        <FormField id="charge-categorie" label={Q.category} error={errors.categoryId}>
          <NativeSelect name="categoryId" defaultValue="" onChange={(event) => onCategory(event.target.value)}>
            <option value="" disabled>
              {LABELS.discounts.form.chooseTarget}
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="charge-libelle" label={Q.label} error={errors.label} className="sm:col-span-2 sm:row-start-1">
          <Input name="label" maxLength={120} placeholder={Q.labelPlaceholder} />
        </FormField>
        <FormField id="charge-montant" label={Q.amount} error={errors.amount}>
          <Input name="amount" type="number" inputMode="decimal" min={0} step="0.01" className="numeric font-normal" />
        </FormField>
        <FormField id="charge-date" label={Q.date} error={errors.date}>
          <Input name="date" type="date" defaultValue={defaultDate} className="numeric font-normal" />
        </FormField>
        <FormField id="charge-paiement" label={Q.method}>
          <NativeSelect name="method" defaultValue="">
            <option value="">{Q.methodNone}</option>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {LABELS.paymentMethods[method]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <div className="flex flex-col gap-3 sm:col-span-2 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6">
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                name="recurring"
                checked={recurring}
                onChange={(event) => setRecurring(event.target.checked)}
                className="mt-1 size-4 accent-[var(--primary)]"
              />
              <span className="flex flex-col">
                <span className="font-medium">{Q.recurring}</span>
                <span className="text-caption text-muted-foreground">{Q.recurringHint}</span>
              </span>
            </label>
            <FormField id="charge-justificatif" label={Q.receipt} hint={Q.receiptHint} error={errors.receipt}>
              <Input name="receipt" type="file" accept={ACCEPT} className="font-normal" />
            </FormField>
          </div>
          <Button type="submit" disabled={pending} className="md:self-end">
            {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
            {Q.add}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------
// Brouillons récurrents
// ---------------------------------------------------------------------
function DraftsSection({ drafts, categories }: { drafts: ExpenseView[]; categories: Map<string, ExpenseCategoryView> }) {
  const LABELS = useLabels();
  const D = LABELS.expenses.drafts;
  return (
    <SectionCard title={D.title} description={D.description} className="[&_.bg-card]:ring-1 [&_.bg-card]:ring-highlight/40">
      <ul className="flex flex-col divide-y">
        {drafts.map((draft) => (
          <DraftRow key={draft.id} draft={draft} category={categories.get(draft.categoryId)} />
        ))}
      </ul>
    </SectionCard>
  );
}

function DraftRow({ draft, category }: { draft: ExpenseView; category: ExpenseCategoryView | undefined }) {
  const LABELS = useLabels();
  const D = LABELS.expenses.drafts;
  const [amount, setAmount] = useState(String(draft.amount));
  const [pending, startTransition] = useTransition();

  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <ExpenseIcon name={category?.icon ?? "receipt"} />
        <div className="flex min-w-0 flex-col">
          <span className="font-medium">{draft.label}</span>
          <span className="text-caption text-muted-foreground">
            {category?.name} · {formatDate(draft.date)}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          aria-label={`${LABELS.expenses.quickAdd.amount} — ${draft.label}`}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="numeric w-32 font-normal"
        />
        <Button
          variant="success"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await confirmExpense({ id: draft.id, amount: Number(amount.replace(",", ".")) });
              if (result.ok) toast.success(D.confirmed);
              else toast.error(result.error);
            })
          }
        >
          {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Check aria-hidden />}
          {D.confirm}
        </Button>
        <ConfirmAction
          trigger={
            <Button variant="ghost" aria-label={D.discard}>
              <X aria-hidden />
            </Button>
          }
          title={LABELS.expenses.list.deleteTitle(draft.label)}
          description={LABELS.expenses.list.deleteDescription}
          confirmLabel={D.discard}
          successMessage={LABELS.expenses.list.deleted}
          action={() => deleteExpense(draft.id)}
        />
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------
// Liste du mois
// ---------------------------------------------------------------------
function ExpensesList({
  expenses,
  categories,
  byId,
  total,
}: {
  expenses: ExpenseView[];
  categories: ExpenseCategoryView[];
  byId: Map<string, ExpenseCategoryView>;
  total: number;
}) {
  const LABELS = useLabels();
  const L = LABELS.expenses.list;
  const [filter, setFilter] = useState("");
  const shown = filter ? expenses.filter((expense) => expense.categoryId === filter) : expenses;
  const used = categories.filter((category) => expenses.some((expense) => expense.categoryId === category.id));

  return (
    <SectionCard
      title={L.title}
      aside={
        used.length > 1 ? (
          <NativeSelect aria-label={L.filter} value={filter} onChange={(event) => setFilter(event.target.value)} className="w-48">
            <option value="">{L.allCategories}</option>
            {used.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </NativeSelect>
        ) : null
      }
    >
      {shown.length === 0 ? (
        <p className="text-muted-foreground">{L.empty}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {shown.map((expense) => (
            <ExpenseRow key={expense.id} expense={expense} category={byId.get(expense.categoryId)} categories={categories} />
          ))}
        </ul>
      )}
      <div className="flex items-baseline justify-between gap-4 border-t-2 border-divider pt-3">
        <span className="font-semibold">
          {L.total} <span className="text-caption font-normal text-muted-foreground">· {L.count(expenses.length)}</span>
        </span>
        <span className="numeric text-section text-heading">{formatMAD(total)}</span>
      </div>
    </SectionCard>
  );
}

function ExpenseRow({
  expense,
  category,
  categories,
}: {
  expense: ExpenseView;
  category: ExpenseCategoryView | undefined;
  categories: ExpenseCategoryView[];
}) {
  const LABELS = useLabels();
  const L = LABELS.expenses.list;
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  const attach = (file: File) => {
    const data = new FormData();
    data.set("id", expense.id);
    data.set("receipt", file);
    startTransition(async () => {
      const result = await attachExpenseReceipt(data);
      if (!result.ok) toast.error(result.error);
    });
  };

  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <ExpenseIcon name={category?.icon ?? "receipt"} />
        <div className="flex min-w-0 flex-col">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{expense.label}</span>
            {expense.recurring ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-caption font-medium text-muted-foreground">
                <Repeat className="size-3" aria-hidden />
                {L.recurring}
              </span>
            ) : null}
          </span>
          <span className="text-caption text-muted-foreground">
            {category?.name} · {formatDate(expense.date)}
            {expense.method ? ` · ${LABELS.paymentMethods[expense.method]}` : ""}
            {expense.recordedByName ? ` · ${L.recordedBy(expense.recordedByName)}` : ""}
          </span>
          {expense.notes ? <span className="text-caption">{expense.notes}</span> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        <span className="numeric mr-2 font-semibold">{formatMAD(expense.amount)}</span>
        {expense.receiptUrl ? (
          <Button asChild variant="outline">
            <a href={expense.receiptUrl} target="_blank" rel="noopener">
              <Paperclip aria-hidden />
              {L.receipt}
            </a>
          </Button>
        ) : (
          <>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) attach(file);
                event.target.value = "";
              }}
            />
            <Button variant="ghost" disabled={pending} onClick={() => fileRef.current?.click()}>
              {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Paperclip aria-hidden />}
              {L.attach}
            </Button>
          </>
        )}
        <EditExpenseDialog expense={expense} categories={categories} />
        {expense.recurring ? (
          <ConfirmAction
            variant="default"
            trigger={
              <Button variant="ghost" aria-label={L.stopRecurring}>
                <Repeat aria-hidden />
              </Button>
            }
            title={L.stopRecurring}
            description={LABELS.expenses.quickAdd.recurringHint}
            confirmLabel={L.stopRecurring}
            successMessage={L.stoppedRecurring}
            action={() => stopExpenseRecurrence(expense.seriesId)}
          />
        ) : null}
        <ConfirmAction
          trigger={
            <Button variant="ghost" className="text-danger-ink" aria-label={L.delete}>
              <Trash2 aria-hidden />
            </Button>
          }
          title={L.deleteTitle(expense.label)}
          description={L.deleteDescription}
          confirmLabel={L.delete}
          successMessage={L.deleted}
          action={() => deleteExpense(expense.id)}
        />
      </div>
    </li>
  );
}

function EditExpenseDialog({ expense, categories }: { expense: ExpenseView; categories: ExpenseCategoryView[] }) {
  const LABELS = useLabels();
  const Q = LABELS.expenses.quickAdd;
  const E = LABELS.expenses.edit;
  const initial = () => ({
    categoryId: expense.categoryId,
    label: expense.label,
    amount: String(expense.amount),
    date: expense.date,
    method: expense.method ?? "",
    notes: expense.notes ?? "",
  });
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof ReturnType<typeof initial>) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  return (
    <FormDialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setValues(initial());
          setErrors({});
          setError(null);
        }
      }}
      title={E.title}
      pending={pending}
      error={error}
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await updateExpense({ id: expense.id, ...values });
          if (!result.ok) {
            setError(result.error);
            setErrors(result.fieldErrors ?? {});
            return;
          }
          toast.success(E.saved);
          setOpen(false);
        });
      }}
      trigger={
        <Button variant="ghost" aria-label={LABELS.expenses.list.edit}>
          <Pencil aria-hidden />
        </Button>
      }
    >
      <FormField id={`modif-categorie-${expense.id}`} label={Q.category} error={errors.categoryId}>
        <NativeSelect value={values.categoryId} onChange={set("categoryId")}>
          {categories
            .filter((category) => category.isActive || category.id === expense.categoryId)
            .map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
        </NativeSelect>
      </FormField>
      <FormField id={`modif-libelle-${expense.id}`} label={Q.label} error={errors.label}>
        <Input maxLength={120} value={values.label} onChange={set("label")} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField id={`modif-montant-${expense.id}`} label={Q.amount} error={errors.amount}>
          <Input type="number" inputMode="decimal" min={0} step="0.01" value={values.amount} onChange={set("amount")} className="numeric font-normal" />
        </FormField>
        <FormField id={`modif-date-${expense.id}`} label={Q.date} error={errors.date}>
          <Input type="date" value={values.date} onChange={set("date")} className="numeric font-normal" />
        </FormField>
        <FormField id={`modif-paiement-${expense.id}`} label={Q.method}>
          <NativeSelect value={values.method} onChange={set("method")}>
            <option value="">{Q.methodNone}</option>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {LABELS.paymentMethods[method]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      <FormField id={`modif-note-${expense.id}`} label={E.notes}>
        <Textarea rows={2} maxLength={500} value={values.notes} onChange={set("notes")} />
      </FormField>
    </FormDialog>
  );
}
