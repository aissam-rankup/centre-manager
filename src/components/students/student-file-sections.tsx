import { CalendarCheck, CircleDollarSign, MessageSquareText, Receipt, ReceiptText, StickyNote } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ContactButtons } from "@/components/assistant/contact-buttons";
import { DiscountBadges } from "@/components/discounts/discount-badge";
import { FollowUpDialog } from "@/components/assistant/follow-up-dialog";
import { type PayableInvoice, PayInvoiceButton, PaymentDialog } from "@/components/receipts/payment-dialog";
import { ReminderActions } from "@/components/reminders/reminder-actions";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/lib/auth/routes";
import type { AppLabels } from "@/lib/constants/labels";
import { getLabels } from "@/lib/i18n/server";
import type { StudentFile, StudentInvoice } from "@/lib/data/assistant";
import { getCashOpening } from "@/lib/data/cash";
import { discountBadgeLabel, discountState } from "@/lib/discounts";
import { formatDate, formatDateTime, formatMAD, toISODate, today } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";

/** Sections de la fiche élève, partagées par les espaces Accueil et Admin. */

// ---------------------------------------------------------------------
// En-tête
// ---------------------------------------------------------------------
export async function StudentHeader({ student, actions }: { student: StudentFile; actions?: ReactNode }) {
  const LABELS = await getLabels();
  const L = LABELS.assistant.student;
  const guardianLabel = student.guardianName ?? student.fullName;
  const todayIso = toISODate(today());
  const activeDiscounts = student.discounts.filter((discount) => discountState(discount, todayIso) === "active");

  return (
    <Card>
      <CardContent className="flex flex-col gap-6 md:flex-row md:items-start">
        <div className="flex flex-1 flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
          <StudentAvatar
            name={student.fullName}
            photoUrl={student.photoUrl}
            size="profile"
            status={student.isOverdue ? "overdue" : "upToDate"}
          />
          <div className="flex min-w-0 flex-col items-center gap-2 sm:items-start">
            <h1 className="text-title text-heading">{student.fullName}</h1>
            <p className="text-muted-foreground">{student.levelName}</p>
            <StatusBadge status={student.isOverdue ? "overdue" : "upToDate"} />
            <DiscountBadges discounts={activeDiscounts} max={3} className="justify-center sm:justify-start" />
            <p className="text-caption text-muted-foreground">{L.enrolledOn(formatDate(student.createdAt))}</p>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-divider pt-4 md:w-80 md:border-t-0 md:border-l md:pt-0 md:pl-6">
          <div className="flex flex-col gap-1">
            <p className="text-caption text-muted-foreground">{L.guardian}</p>
            {student.guardianName || student.guardianPhone ? (
              <>
                {student.guardianName ? <p className="font-medium">{student.guardianName}</p> : null}
                {student.guardianPhone ? <p className="numeric font-normal">{formatPhone(student.guardianPhone)}</p> : null}
              </>
            ) : (
              <p className="text-muted-foreground">{L.noGuardian}</p>
            )}
          </div>
          <ContactButtons phone={student.guardianPhone} name={guardianLabel} variant="labeled" />
          <FollowUpDialog
            studentId={student.id}
            studentName={student.fullName}
            invoiceId={student.oldestOverdueInvoiceId}
            defaultType={student.isOverdue ? "payment" : "absence"}
          />
          {actions}
        </div>
      </CardContent>

      {student.notes ? (
        <CardContent className="border-t border-divider pt-4">
          <div className="flex items-start gap-3 rounded-lg bg-muted px-4 py-3">
            <StickyNote className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="flex flex-col gap-1">
              <p className="text-caption font-medium text-muted-foreground">{L.notes}</p>
              <p className="whitespace-pre-line">{student.notes}</p>
            </div>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------
// Matières payées
// ---------------------------------------------------------------------
export async function SubjectsSection({ student }: { student: StudentFile }) {
  const LABELS = await getLabels();
  const L = LABELS.assistant.student;
  // Les matières d'un pack sont listées sous le pack, qui porte le prix et la facture.
  const standalone = student.enrollments.filter((enrollment) => !enrollment.packEnrollmentId);
  const packs = student.packSubscriptions;

  return (
    <SectionCard id="matieres" title={L.sections.subjects}>
      {standalone.length === 0 && packs.length === 0 ? (
        <EmptyState icon={CircleDollarSign} title={L.subjects.emptyTitle} description={L.subjects.emptyDescription} />
      ) : (
        <ul className="flex flex-col divide-y">
          {packs.map((pack) => (
            <SubscriptionRow
              key={pack.id}
              title={LABELS.packs.label(pack.packName)}
              detail={LABELS.packs.includes(pack.subjectNames.join(", "))}
              billingDay={pack.billingDay}
              nextDueDate={pack.nextDueDate}
              price={pack.priceAgreed}
              active={pack.active}
            />
          ))}
          {standalone.map((enrollment) => (
            <SubscriptionRow
              key={enrollment.id}
              title={enrollment.subjectName}
              billingDay={enrollment.billingDay}
              nextDueDate={enrollment.nextDueDate}
              price={enrollment.priceAgreed}
              active={enrollment.active}
            />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

type SubscriptionRowProps = {
  title: string;
  detail?: string;
  billingDay: number;
  nextDueDate: string | null;
  price: number;
  active: boolean;
};

async function SubscriptionRow({ title, detail, billingDay, nextDueDate, price, active }: SubscriptionRowProps) {
  const LABELS = await getLabels();
  const L = LABELS.assistant.student;
  return (
    <li className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        {detail ? <span className="text-caption text-muted-foreground">{detail}</span> : null}
        <span className="text-caption text-muted-foreground">
          {active ? LABELS.billing.cycle[billingDay] : LABELS.admin.students.enrollments.inactive} ·{" "}
          {nextDueDate ? L.subjects.nextDue(formatDate(nextDueDate)) : L.subjects.upToDate}
        </span>
      </div>
      <span className="shrink-0 text-right">
        <Money amount={price} />
        <span className="block text-caption text-muted-foreground">{LABELS.billing.perMonth}</span>
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------
// Paiements
// ---------------------------------------------------------------------
function periodLabel(invoice: StudentInvoice, LABELS: AppLabels): string {
  return LABELS.billing.period(formatDate(invoice.periodStart), formatDate(invoice.periodEnd));
}

function payableInvoices(student: StudentFile, LABELS: AppLabels): PayableInvoice[] {
  const todayIso = toISODate(today());
  return student.invoices
    .filter((invoice) => invoice.status !== "paid")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.subjectName.localeCompare(b.subjectName, "fr"))
    .map((invoice) => ({
      id: invoice.id,
      subjectName: invoice.subjectName,
      periodLabel: periodLabel(invoice, LABELS),
      dueLabel: LABELS.payment.due(formatDate(invoice.dueDate)),
      overdue: invoice.status === "overdue",
      dueNow: invoice.dueDate <= todayIso,
      amountFull: invoice.amountFull,
      discountAmount: invoice.discountAmount,
      discountLabel: invoice.discount ? discountBadgeLabel(invoice.discount, LABELS) : null,
      amountDue: invoice.amountDue,
    }));
}

function paymentColumns(LABELS: AppLabels, student: StudentFile): readonly DataTableColumn<StudentInvoice>[] {
  const L = LABELS.assistant.student;
  return [
    {
      id: "subject",
      header: L.payments.subject,
      mobile: "title",
      cell: (invoice) => (
        <span className="flex flex-col">
          <span className="font-medium">{invoice.subjectName}</span>
          <span className="text-caption text-muted-foreground md:hidden">{periodLabel(invoice, LABELS)}</span>
        </span>
      ),
    },
    { id: "period", header: L.payments.period, mobile: "hidden", cell: (invoice) => periodLabel(invoice, LABELS) },
    { id: "amount", header: L.payments.amount, align: "end", cell: (invoice) => <InvoiceAmount invoice={invoice} LABELS={LABELS} /> },
    {
      id: "dueDate",
      header: L.payments.dueDate,
      cell: (invoice) => <span className="numeric font-normal">{formatDate(invoice.dueDate)}</span>,
    },
    { id: "status", header: L.payments.status, mobile: "aside", cell: (invoice) => <StatusBadge status={invoice.status} /> },
    {
      id: "action",
      header: L.payments.paidOn,
      className: "whitespace-nowrap",
      cell: (invoice) =>
        invoice.status === "paid" ? (
          <span className="flex flex-col">
            <span className="numeric font-normal">{invoice.paidAt ? formatDate(invoice.paidAt) : LABELS.common.none}</span>
            {invoice.receiptId && invoice.receiptNumber ? (
              <Link
                href={ROUTES.receipt(invoice.receiptId)}
                className="inline-flex items-center gap-1 text-caption font-medium text-primary underline-offset-4 hover:underline"
              >
                <ReceiptText className="size-3.5" aria-hidden />
                {LABELS.receipts.number(invoice.receiptNumber)}
              </Link>
            ) : null}
          </span>
        ) : (
          <PayInvoiceButton studentId={student.id} invoiceId={invoice.id} label={LABELS.payment.payThis} />
        ),
    },
  ];
}

/** Montant d'une facture : net en évidence ; avec remise, tarif plein barré et remise. */
function InvoiceAmount({ invoice, LABELS }: { invoice: StudentInvoice; LABELS: AppLabels }) {
  if (invoice.discountAmount <= 0) return <Money amount={invoice.amountDue} />;
  const D = LABELS.discounts.invoice;
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span className="numeric text-caption font-normal text-muted-foreground line-through">
        <span className="sr-only">{D.full} : </span>
        {formatMAD(invoice.amountFull)}
      </span>
      <span className="numeric text-caption font-medium text-foreground">
        <span className="sr-only">{D.discount} : </span>− {formatMAD(invoice.discountAmount)}
      </span>
      <span className="font-semibold">
        <span className="sr-only">{D.net} : </span>
        <Money amount={invoice.amountDue} />
      </span>
    </span>
  );
}

export async function PaymentsSection({ student }: { student: StudentFile }) {
  const LABELS = await getLabels();
  const L = LABELS.assistant.student;
  const payable = payableInvoices(student, LABELS);
  const cashOpening = payable.length > 0 ? await getCashOpening() : undefined;
  return (
    <SectionCard
      id="paiements"
      title={L.sections.payments}
      aside={
        <PaymentDialog
          studentId={student.id}
          studentName={student.fullName}
          guardianPhone={student.guardianPhone}
          invoices={payable}
          triggerLabel={LABELS.payment.trigger}
          cashOpening={cashOpening}
        />
      }
    >
      {student.reminderItems.length > 0 ? <StudentReminders student={student} LABELS={LABELS} /> : null}
      {student.invoices.length === 0 ? (
        <EmptyState icon={Receipt} title={L.payments.emptyTitle} description={L.payments.emptyDescription} />
      ) : (
        <DataTable
          columns={paymentColumns(LABELS, student)}
          rows={student.invoices}
          getRowId={(invoice) => invoice.id}
          caption={L.payments.caption}
          variant="plain"
        />
      )}
    </SectionCard>
  );
}

/** Rappels de paiement à envoyer pour cet élève (campagnes confirmées, factures non réglées). */
function StudentReminders({ student, LABELS }: { student: StudentFile; LABELS: AppLabels }) {
  const R = LABELS.reenrollment.reminders;
  return (
    <div className="flex flex-col gap-3 rounded-xl border px-4 py-3">
      <h3 className="font-semibold">{R.studentTitle}</h3>
      <ul className="flex flex-col divide-y divide-divider">
        {student.reminderItems.map((item) => (
          <li key={`${item.runId}:${item.dueDate}`} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 lg:flex-row lg:items-center">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={cn("font-medium", item.type === "overdue" && "text-danger-ink")}>{R.waves[item.type]}</span>
                <Money amount={item.amountDue} />
              </span>
              <span className="text-caption text-muted-foreground">
                {item.subjectNames.join(", ")} · {R.due(formatDate(item.dueDate))}
                {item.type === "overdue" && item.daysOverdue !== null ? ` · ${R.late(R.days(item.daysOverdue))}` : ""}
              </span>
              <span className={cn("text-caption font-medium", item.lastSentAt ? "text-success-ink" : "text-muted-foreground")}>
                {item.lastSentAt && item.lastChannel
                  ? R.sent(R.channels[item.lastChannel], formatDateTime(item.lastSentAt), item.lastSentByName)
                  : R.notSent}
              </span>
            </div>
            <ReminderActions item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------
// Absences
// ---------------------------------------------------------------------
export async function AbsencesSection({ student }: { student: StudentFile }) {
  const LABELS = await getLabels();
  const L = LABELS.assistant.student;
  return (
    <SectionCard
      id="absences"
      title={L.sections.absences}
      aside={
        student.absences.length > 0 ? (
          <span className="text-caption font-medium text-warning-ink">{L.absences.total(student.absences.length)}</span>
        ) : null
      }
    >
      {student.absences.length === 0 ? (
        <EmptyState icon={CalendarCheck} title={L.absences.emptyTitle} description={L.absences.emptyDescription} />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {student.absences.map((absence) => (
            <li key={absence.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <span className="truncate">{absence.subjectName}</span>
              <span className="numeric shrink-0 font-normal text-muted-foreground">{formatDate(absence.sessionDate)}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------
// Relances
// ---------------------------------------------------------------------
export async function FollowUpsSection({ student }: { student: StudentFile }) {
  const LABELS = await getLabels();
  const L = LABELS.assistant.student;
  const R = LABELS.reenrollment.reminders;
  // Relances saisies et rappels de paiement envoyés, dans un seul historique.
  const entries = [
    ...student.followUps.map((followUp) => ({ kind: "followUp" as const, at: followUp.createdAt, followUp })),
    ...student.reminders.map((reminder) => ({ kind: "reminder" as const, at: reminder.sentAt, reminder })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <SectionCard id="relances" title={L.sections.followUps}>
      {entries.length === 0 ? (
        <EmptyState icon={MessageSquareText} title={L.followUps.emptyTitle} description={L.followUps.emptyDescription} />
      ) : (
        <ol className="flex flex-col divide-y">
          {entries.map((entry) =>
            entry.kind === "followUp" ? (
              <li key={entry.followUp.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">{LABELS.followUp.types[entry.followUp.type]}</span>
                  <span className="text-caption text-muted-foreground">·</span>
                  <span className="text-caption text-muted-foreground">{LABELS.followUp.channels[entry.followUp.channel]}</span>
                </div>
                {entry.followUp.note ? <p className="whitespace-pre-line">{entry.followUp.note}</p> : null}
                <p className="text-caption text-muted-foreground">
                  {formatDateTime(entry.followUp.createdAt)}
                  {entry.followUp.authorName ? ` ${L.followUps.by(entry.followUp.authorName)}` : ""}
                </p>
              </li>
            ) : (
              <li key={entry.reminder.messageId} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">{R.history(R.waves[entry.reminder.type])}</span>
                  <span className="text-caption text-muted-foreground">·</span>
                  <span className="text-caption text-muted-foreground">{LABELS.absenceAlerts.channelNames[entry.reminder.channel]}</span>
                </div>
                <p>{R.historyDetail(formatMAD(entry.reminder.amount), entry.reminder.subjectNames.join(", "))}</p>
                <p className="text-caption text-muted-foreground">
                  {formatDateTime(entry.reminder.sentAt)}
                  {entry.reminder.authorName ? ` ${L.followUps.by(entry.reminder.authorName)}` : ""}
                </p>
              </li>
            ),
          )}
        </ol>
      )}
    </SectionCard>
  );
}
