"use client";

import { LoaderCircle, Plus, Power, PowerOff, Save, Settings2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ExpenseIcon } from "@/components/expenses/expense-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { saveExpenseCategory, setExpenseCategoryActive } from "@/lib/actions/expenses";
import { EXPENSE_ICONS, type ExpenseCategoryView, type ExpenseIcon as ExpenseIconName } from "@/lib/expenses";
import { useLabels } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/** Catégories de charges : ajout, renommage, icône, désactivation. */
export function CategoriesDialog({ categories }: { categories: ExpenseCategoryView[] }) {
  const LABELS = useLabels();
  const C = LABELS.expenses.categories;
  const [adding, setAdding] = useState(false);

  return (
    <Dialog onOpenChange={(open) => !open && setAdding(false)}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Settings2 aria-hidden />
          {C.manage}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-section">{C.title}</DialogTitle>
          <DialogDescription>{C.description}</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col divide-y">
          {categories.map((category) => (
            <CategoryRow key={category.id} category={category} />
          ))}
        </ul>
        {adding ? (
          <ul>
            <CategoryEditor onDone={() => setAdding(false)} />
          </ul>
        ) : (
          <Button variant="outline" className="self-start" onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            {C.add}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CategoryRow({ category }: { category: ExpenseCategoryView }) {
  const LABELS = useLabels();
  const C = LABELS.expenses.categories;
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  if (editing) return <CategoryEditor category={category} onDone={() => setEditing(false)} />;

  return (
    <li className={cn("flex items-center justify-between gap-3 py-2.5", !category.isActive && "opacity-60")}>
      <button type="button" onClick={() => setEditing(true)} className="flex min-w-0 items-center gap-3 rounded-lg text-left hover:underline">
        <ExpenseIcon name={category.icon} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{category.name}</span>
          {!category.isActive ? <span className="text-caption text-muted-foreground">{C.inactive}</span> : null}
        </span>
      </button>
      <Button
        variant="ghost"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await setExpenseCategoryActive({ id: category.id, active: !category.isActive });
            if (!result.ok) toast.error(result.error);
          })
        }
      >
        {category.isActive ? <PowerOff aria-hidden /> : <Power aria-hidden />}
        {category.isActive ? C.deactivate : C.activate}
      </Button>
    </li>
  );
}

function CategoryEditor({ category, onDone }: { category?: ExpenseCategoryView; onDone: () => void }) {
  const LABELS = useLabels();
  const C = LABELS.expenses.categories;
  const [name, setName] = useState(category?.name ?? "");
  const [icon, setIcon] = useState<ExpenseIconName>(category?.icon ?? "receipt");
  const [recurring, setRecurring] = useState(category?.isRecurring ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fieldId = `categorie-${category?.id ?? "nouvelle"}`;

  return (
    <li className="flex list-none flex-col gap-3 rounded-xl bg-muted p-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={fieldId} className="text-caption font-medium">
          {C.name}
        </label>
        <Input id={fieldId} value={name} maxLength={60} onChange={(event) => setName(event.target.value)} aria-invalid={error ? true : undefined} />
        {error ? <p className="text-caption text-danger-ink">{error}</p> : null}
      </div>
      <div role="radiogroup" aria-label={C.icon} className="flex flex-wrap gap-1.5">
        {EXPENSE_ICONS.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={icon === value}
            aria-label={value}
            onClick={() => setIcon(value)}
            className={cn("rounded-lg p-0.5 ring-offset-2 ring-offset-muted", icon === value && "ring-2 ring-primary")}
          >
            <ExpenseIcon name={value} className="size-8" />
          </button>
        ))}
      </div>
      <label className="flex cursor-pointer items-center gap-2">
        <input type="checkbox" checked={recurring} onChange={(event) => setRecurring(event.target.checked)} className="size-4 accent-[var(--primary)]" />
        {C.recurringDefault}
      </label>
      <div className="flex gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await saveExpenseCategory({ id: category?.id, name, icon, isRecurring: recurring });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              toast.success(C.saved);
              onDone();
            })
          }
        >
          {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {C.save}
        </Button>
        <Button variant="ghost" onClick={onDone} disabled={pending}>
          {LABELS.common.cancel}
        </Button>
      </div>
    </li>
  );
}
