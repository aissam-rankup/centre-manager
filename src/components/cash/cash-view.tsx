import { Banknote, Lock, ShieldAlert, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { CashMovementDialog, CloseCashForm, OpenCashForm } from "@/components/cash/cash-forms";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { ROUTES } from "@/lib/auth/routes";
import type { CashSessionSummary } from "@/lib/cash";
import type { AppLabels } from "@/lib/constants/labels";
import type { CashPage } from "@/lib/data/cash";
import { formatDate, formatDateTime, formatMAD, formatTime } from "@/lib/format";
import { getLabels } from "@/lib/i18n/server";
import { PAYMENT_METHODS } from "@/lib/receipts";
import { cn } from "@/lib/utils";

/** Caisse du jour : ouverture, encaissements par mode, mouvements, comptage et clôture. */
export async function CashView({ page, fileBase }: { page: CashPage; fileBase: string }) {
  const LABELS = await getLabels();
  const C = LABELS.cash;

  if (page.support) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={LABELS.nav.cash} description={C.description} />
        <EmptyState icon={ShieldAlert} title={C.supportReadOnly} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={LABELS.nav.cash}
        description={C.description}
        actions={page.current ? <CashMovementDialog finance={page.finance} /> : null}
      />

      {page.stale.map((session) => (
        <div key={session.id} className="flex flex-col gap-3">
          <p className="flex items-start gap-2 rounded-xl bg-warning/10 px-4 py-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-ink" aria-hidden />
            <span>
              <span className="font-semibold">{C.staleTitle}</span> {C.staleDescription}
            </span>
          </p>
          <SessionPanel session={session} LABELS={LABELS} fileBase={fileBase} />
        </div>
      ))}

      {page.current && !page.current.receipts.some((receipt) => receipt.kind === "payment") ? (
        <SectionCard title={C.floatTitle} description={C.floatDescription}>
          <OpenCashForm initialFloat={page.current.openingFloat} adjust />
        </SectionCard>
      ) : null}

      {page.current ? (
        <SessionPanel session={page.current} LABELS={LABELS} fileBase={fileBase} />
      ) : (
        <SectionCard title={C.closedTitle} description={C.closedDescription}>
          <OpenCashForm />
        </SectionCard>
      )}

      {page.closedToday.map((session) => (
        <SessionPanel key={session.id} session={session} LABELS={LABELS} fileBase={fileBase} />
      ))}
    </div>
  );
}

/** Une session : totaux par mode, liste des encaissements et des mouvements, clôture ou résultat. */
export function SessionPanel({
  session,
  LABELS,
  fileBase,
  closable = true,
}: {
  session: CashSessionSummary;
  LABELS: AppLabels;
  fileBase: string;
  closable?: boolean;
}) {
  const C = LABELS.cash;
  const open = session.status === "open";
  const total = PAYMENT_METHODS.reduce((sum, method) => sum + session.byMethod[method], 0);
  const title = `${C.sessionOf(formatDate(session.sessionDate))} · ${session.isShared ? C.shared : C.personal(session.holderName)}`;

  return (
    <SectionCard
      title={title}
      description={C.openedAt(formatTime(session.openedAt), session.openedByName, formatMAD(session.openingFloat))}
      aside={
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-caption font-medium",
            open ? "bg-success/10 text-success-ink" : "bg-muted text-muted-foreground",
          )}
        >
          {open ? <Banknote className="size-3.5" aria-hidden /> : <Lock className="size-3.5" aria-hidden />}
          {C.status[session.status]}
        </span>
      }
    >
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {PAYMENT_METHODS.map((method) => (
          <div key={method} className="flex flex-col rounded-lg bg-muted px-3 py-2">
            <dt className="text-caption text-muted-foreground">{C.methods[method]}</dt>
            <dd className="numeric font-semibold">{formatMAD(session.byMethod[method])}</dd>
          </div>
        ))}
        <div className="col-span-2 flex flex-col rounded-lg bg-primary-soft px-3 py-2 md:col-span-1">
          <dt className="text-caption text-muted-foreground">{C.total}</dt>
          <dd className="numeric font-semibold">{formatMAD(total)}</dd>
          <dd className="text-caption text-muted-foreground">{C.transactions(session.transactions)}</dd>
        </div>
      </dl>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">{C.listTitle}</h3>
            {session.receipts.length === 0 ? (
              <p className="text-caption text-muted-foreground">{C.listEmpty}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-divider">
                {session.receipts.map((receipt) => (
                  <li key={receipt.id} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <span className="numeric w-12 shrink-0 text-caption text-muted-foreground">{formatTime(receipt.issuedAt)}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      {receipt.studentId ? (
                        <Link href={`${fileBase}/${receipt.studentId}`} className="truncate font-medium hover:text-primary">
                          {receipt.studentName}
                        </Link>
                      ) : (
                        <span className="truncate font-medium">{receipt.studentName}</span>
                      )}
                      <Link href={ROUTES.receipt(receipt.id)} className="text-caption text-muted-foreground hover:text-primary">
                        {receipt.kind === "cancellation" ? `${C.cancellation} · ` : ""}
                        {C.receipt(receipt.number)}
                        {receipt.method ? ` · ${C.methods[receipt.method]}` : ""}
                        {receipt.issuedByName ? ` · ${receipt.issuedByName}` : ""}
                      </Link>
                    </span>
                    <span className={cn("numeric shrink-0 font-semibold", receipt.amount < 0 && "text-danger-ink")}>
                      {formatMAD(receipt.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">{C.movementsTitle}</h3>
            {session.movements.length === 0 ? (
              <p className="text-caption text-muted-foreground">{C.movementsEmpty}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-divider">
                {session.movements.map((movement) => (
                  <li key={movement.id} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <span className="numeric w-12 shrink-0 text-caption text-muted-foreground">{formatTime(movement.createdAt)}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium">{C.movementKinds[movement.kind]}</span>
                      <span className="text-caption text-muted-foreground">
                        {movement.reason ?? C.hiddenReason}
                        {movement.createdByName ? ` · ${movement.createdByName}` : ""}
                      </span>
                    </span>
                    <span className={cn("numeric shrink-0 font-semibold", movement.amount < 0 && "text-danger-ink")}>
                      {formatMAD(movement.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-xl border px-4 py-4">
          <div className="flex flex-col gap-1">
            <h3 className="font-semibold">{C.expected.title}</h3>
            <p className="numeric text-2xl font-bold text-heading">{formatMAD(session.expectedCash)}</p>
            <p className="text-caption text-muted-foreground">
              {C.expected.formula(formatMAD(session.openingFloat), formatMAD(session.byMethod.cash), formatMAD(session.movementsTotal))}
            </p>
            <p className="text-caption text-muted-foreground">{C.expected.note}</p>
          </div>
          {open && closable ? (
            <CloseCashForm sessionId={session.id} expectedCash={session.expectedCash} />
          ) : !open ? (
            <ClosedResult session={session} LABELS={LABELS} />
          ) : null}
        </div>
      </div>
    </SectionCard>
  );
}

function ClosedResult({ session, LABELS }: { session: CashSessionSummary; LABELS: AppLabels }) {
  const C = LABELS.cash;
  const variance = session.variance ?? 0;
  return (
    <div className="flex flex-col gap-2">
      <p className="flex justify-between gap-3">
        <span className="text-muted-foreground">{C.countedCash}</span>
        <span className="numeric font-semibold">{formatMAD(session.countedCash ?? 0)}</span>
      </p>
      <p className={cn("rounded-lg px-3 py-2 font-semibold", variance === 0 ? "bg-success/10 text-success-ink" : "bg-danger/10 text-danger-ink")}>
        {variance === 0 ? C.variance.none : variance < 0 ? C.variance.shortage(formatMAD(-variance)) : C.variance.surplus(formatMAD(variance))}
      </p>
      {session.varianceReason ? <p className="text-caption">{session.varianceReason}</p> : null}
      {session.notes ? <p className="text-caption text-muted-foreground">{session.notes}</p> : null}
      {session.closedAt ? <p className="text-caption text-muted-foreground">{C.closedAt(formatDateTime(session.closedAt), session.closedByName)}</p> : null}
    </div>
  );
}
