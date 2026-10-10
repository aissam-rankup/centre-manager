"use client";

import { CalendarClock, CalendarSync, LoaderCircle, Save, Sparkles, TriangleAlert } from "lucide-react";
import Link from "@/components/shared/app-link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/shared/form-field";
import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { prepareBillingRun, updateReenrollmentSettings } from "@/lib/actions/reenrollment";
import { ROUTES } from "@/lib/auth/routes";
import { formatDate, formatDateTime, formatDayMonth, formatMAD, formatMonth } from "@/lib/format";
import { useLabels, useLocale, useMessage } from "@/lib/i18n/client";
import { campaignDueDate, isoDate, type ReenrollmentSettings, validDay } from "@/lib/reenrollment";
import { cn } from "@/lib/utils";

export function ReenrollmentSettingsForm({ settings }: { settings: ReenrollmentSettings }) {
  const LABELS = useLabels();
  const locale = useLocale();
  const message = useMessage();
  const S = LABELS.reenrollment.settings;
  const [enabled, setEnabled] = useState(settings.enabled);
  const [generationDay, setGenerationDay] = useState(String(settings.generationDay));
  const [dueDay, setDueDay] = useState(String(settings.dueDay));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [preparing, startPreparing] = useTransition();

  const { year, month } = settings.nextMonth;
  const monthName = formatMonth(isoDate(year, month, 1), locale);
  const run = settings.nextRun;
  const dueValue = validDay(dueDay, settings.dueDay);
  const generationValue = validDay(generationDay, settings.generationDay);
  const draft = settings.currentDraft;

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setErrors({});
        startTransition(async () => {
          const result = await updateReenrollmentSettings({ enabled, generationDay, dueDay });
          if (!result.ok) {
            setErrors(result.fieldErrors ?? {});
            toast.error(message(result.error));
            return;
          }
          toast.success(LABELS.centerSettings.saved);
        });
      }}
    >
      <SectionCard title={S.title} description={S.description}>
        <label className="flex cursor-pointer items-start gap-2">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="mt-1 size-4 accent-[var(--primary)]" />
          <span className="flex flex-col">
            <span className="font-medium">{S.enabled}</span>
            <span className="text-caption text-muted-foreground">{S.enabledHint}</span>
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="jour-preparation" label={S.generationDay} hint={S.generationDayHint(generationValue)} error={errors.generationDay}>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={28}
              value={generationDay}
              onChange={(event) => setGenerationDay(event.target.value)}
              className="numeric font-normal"
            />
          </FormField>
          <FormField
            id="jour-echeance"
            label={S.dueDay}
            hint={S.dueDayHint(
              monthName,
              formatDayMonth(campaignDueDate(year, month, 1, dueValue), locale),
              formatDayMonth(campaignDueDate(year, month, 15, dueValue), locale),
            )}
            error={errors.dueDay}
          >
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={28}
              value={dueDay}
              onChange={(event) => setDueDay(event.target.value)}
              className="numeric font-normal"
            />
          </FormField>
        </div>

        {draft ? (
          <div className="flex flex-col gap-3 rounded-xl bg-warning/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-ink" aria-hidden />
              {S.currentDraft(formatMonth(isoDate(draft.year, draft.month, 1), locale))}
            </p>
            <Button asChild variant="outline" className="self-start sm:self-auto">
              <Link href={`${ROUTES.admin.reenrollment}?campagne=${draft.id}`}>{S.openCampaign}</Link>
            </Button>
          </div>
        ) : null}

        <div className={cn("flex flex-col gap-2 rounded-xl px-4 py-3", run && run.status !== "cancelled" ? "bg-primary-soft" : "bg-muted")}>
          <span className="flex items-center gap-2 text-caption font-medium text-muted-foreground">
            <CalendarClock className="size-4" aria-hidden />
            {S.next}
          </span>
          {!settings.enabled ? (
            <p>{S.disabledNotice}</p>
          ) : run?.status === "cancelled" ? (
            <p className="font-medium">{S.cancelledSummary(monthName)}</p>
          ) : run ? (
            <>
              <p className="font-medium">
                {S.runStatus[run.status]} · {S.runSummary(monthName, run.studentCount, formatMAD(run.totalExpected))}
              </p>
              <p className="text-caption text-muted-foreground">
                {run.automatic ? S.generatedAuto(formatDateTime(run.generatedAt)) : S.generatedBy(formatDateTime(run.generatedAt))}
              </p>
              <Button asChild variant="outline" className="self-start">
                <Link href={`${ROUTES.admin.reenrollment}?campagne=${run.id}`}>
                  <CalendarSync aria-hidden />
                  {S.openCampaign}
                </Link>
              </Button>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p>
                {settings.preparation.kind === "scheduled"
                  ? S.scheduled(monthName, formatDate(settings.preparation.date))
                  : settings.preparation.kind === "tonight"
                    ? S.tonight(monthName)
                    : S.missed(monthName)}
              </p>
              {settings.support ? null : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={preparing}
                  onClick={() =>
                    startPreparing(async () => {
                      const result = await prepareBillingRun();
                      if (result.ok) toast.success(S.prepared);
                      else toast.error(message(result.error));
                    })
                  }
                >
                  {preparing ? <LoaderCircle className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
                  {S.prepareNow}
                </Button>
              )}
            </div>
          )}
        </div>

        <Button type="submit" disabled={pending} className="self-end">
          {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {LABELS.centerSettings.save}
        </Button>
      </SectionCard>
    </form>
  );
}
