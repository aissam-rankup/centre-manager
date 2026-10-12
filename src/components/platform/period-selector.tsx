"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ROUTES } from "@/lib/auth/routes";
import { formatMonth } from "@/lib/format";
import { useLabels, useLocale } from "@/lib/i18n/client";
import { PERIOD_KINDS, type PeriodForm, type PeriodKind } from "@/lib/platform-period";

/**
 * Choix de la période (formulaire GET : l'adresse garde la sélection) :
 * mois, trimestre, année ou dates de début et de fin.
 */
export function PeriodSelector({
  form,
  options,
  todayIso,
}: {
  form: PeriodForm;
  options: { months: string[]; quarters: string[]; years: string[] };
  todayIso: string;
}) {
  const L = useLabels().platformConsole.period;
  const locale = useLocale();
  const [kind, setKind] = useState<PeriodKind>(form.kind);

  return (
    <form action={ROUTES.platform.home} method="get" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="flex flex-col gap-1.5 sm:w-48">
        <Label htmlFor="periode">{L.legend}</Label>
        <NativeSelect id="periode" name="periode" value={kind} onChange={(event) => setKind(event.target.value as PeriodKind)}>
          {PERIOD_KINDS.map((value) => (
            <option key={value} value={value}>
              {L.kinds[value]}
            </option>
          ))}
        </NativeSelect>
      </div>

      {kind === "month" ? (
        <div className="flex flex-col gap-1.5 sm:w-56">
          <Label htmlFor="mois">{L.month}</Label>
          <NativeSelect id="mois" name="mois" defaultValue={form.month}>
            {options.months.map((month) => (
              <option key={month} value={month}>
                {formatMonth(`${month}-01`, locale)}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}

      {kind === "quarter" ? (
        <div className="flex flex-col gap-1.5 sm:w-44">
          <Label htmlFor="trimestre">{L.quarter}</Label>
          <NativeSelect id="trimestre" name="trimestre" defaultValue={form.quarter}>
            {options.quarters.map((quarter) => {
              const [year, q] = quarter.split("-Q").map(Number);
              return (
                <option key={quarter} value={quarter}>
                  {L.quarterOption(q, year)}
                </option>
              );
            })}
          </NativeSelect>
        </div>
      ) : null}

      {kind === "year" ? (
        <div className="flex flex-col gap-1.5 sm:w-36">
          <Label htmlFor="annee">{L.year}</Label>
          <NativeSelect id="annee" name="annee" defaultValue={form.year}>
            {options.years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}

      {kind === "custom" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="du">{L.from}</Label>
            <Input id="du" name="du" type="date" required max={todayIso} defaultValue={form.from} className="numeric font-normal" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="au">{L.to}</Label>
            <Input id="au" name="au" type="date" required defaultValue={form.to} className="numeric font-normal" />
          </div>
        </>
      ) : null}

      <Button type="submit" variant="outline">
        {L.apply}
      </Button>
    </form>
  );
}
