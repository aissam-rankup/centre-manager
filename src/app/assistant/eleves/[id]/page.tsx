import { ArrowLeft, CalendarCheck, CircleDollarSign, MessageSquareText, Receipt, StickyNote } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ContactButtons } from "@/components/assistant/contact-buttons";
import { FollowUpDialog } from "@/components/assistant/follow-up-dialog";
import { MarkPaidButton } from "@/components/assistant/mark-paid-button";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/lib/auth/routes";
import { LABELS } from "@/lib/constants/labels";
import { getStudentFile, type StudentFile, type StudentInvoice } from "@/lib/data/assistant";
import { formatDate, formatDateTime, formatMAD } from "@/lib/format";
import { formatPhone } from "@/lib/phone";

const L = LABELS.assistant.student;

async function loadStudent(id: string): Promise<StudentFile> {
  if (!z.uuid().safeParse(id).success) notFound();
  const student = await getStudentFile(id);
  if (!student) notFound();
  return student;
}

export async function generateMetadata({ params }: PageProps<"/assistant/eleves/[id]">): Promise<Metadata> {
  const { id } = await params;
  const student = z.uuid().safeParse(id).success ? await getStudentFile(id) : null;
  return { title: student?.fullName ?? L.notFoundTitle };
}

export default async function StudentFilePage({ params }: PageProps<"/assistant/eleves/[id]">) {
  const { id } = await params;
  const student = await loadStudent(id);

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" className="-ml-3 self-start">
        <Link href={ROUTES.assistant.students}>
          <ArrowLeft aria-hidden />
          {L.back}
        </Link>
      </Button>

      <StudentHeader student={student} />

      <div className="grid gap-6 lg:grid-cols-2">
        <SubjectsSection student={student} />
        <FollowUpsSection student={student} />
      </div>

      <PaymentsSection student={student} />
      <AbsencesSection student={student} />
    </div>
  );
}

// ---------------------------------------------------------------------
// En-tête
// ---------------------------------------------------------------------
function StudentHeader({ student }: { student: StudentFile }) {
  const guardianLabel = student.guardianName ?? student.fullName;

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
            <h1 className="text-title text-primary dark:text-foreground">{student.fullName}</h1>
            <p className="text-muted-foreground">{student.levelName}</p>
            <StatusBadge status={student.isOverdue ? "overdue" : "upToDate"} />
            <p className="text-caption text-muted-foreground">{L.enrolledOn(formatDate(student.createdAt))}</p>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t pt-4 md:w-80 md:border-t-0 md:border-l md:pt-0 md:pl-6">
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
        </div>
      </CardContent>

      {student.notes ? (
        <CardContent className="border-t pt-4">
          <div className="flex items-start gap-3 rounded-[10px] bg-muted px-4 py-3">
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
function SubjectsSection({ student }: { student: StudentFile }) {
  return (
    <SectionCard id="matieres" title={L.sections.subjects}>
      {student.enrollments.length === 0 ? (
        <EmptyState icon={CircleDollarSign} title={L.subjects.emptyTitle} description={L.subjects.emptyDescription} />
      ) : (
        <ul className="flex flex-col divide-y">
          {student.enrollments.map((enrollment) => (
            <li key={enrollment.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">{enrollment.subjectName}</span>
                <span className="text-caption text-muted-foreground">
                  {LABELS.billing.cycle[enrollment.billingDay]} ·{" "}
                  {enrollment.nextDueDate ? L.subjects.nextDue(formatDate(enrollment.nextDueDate)) : L.subjects.upToDate}
                </span>
              </div>
              <span className="shrink-0 text-right">
                <Money amount={enrollment.priceAgreed} />
                <span className="block text-caption text-muted-foreground">{LABELS.billing.perMonth}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------
// Paiements
// ---------------------------------------------------------------------
function periodLabel(invoice: StudentInvoice): string {
  return LABELS.billing.period(formatDate(invoice.periodStart), formatDate(invoice.periodEnd));
}

const PAYMENT_COLUMNS: readonly DataTableColumn<StudentInvoice>[] = [
  {
    id: "subject",
    header: L.payments.subject,
    mobile: "title",
    cell: (invoice) => (
      <span className="flex flex-col">
        <span className="font-medium">{invoice.subjectName}</span>
        <span className="text-caption text-muted-foreground md:hidden">{periodLabel(invoice)}</span>
      </span>
    ),
  },
  { id: "period", header: L.payments.period, mobile: "hidden", cell: (invoice) => periodLabel(invoice) },
  { id: "amount", header: L.payments.amount, align: "end", cell: (invoice) => <Money amount={invoice.amountDue} /> },
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
        <span className="numeric font-normal">{invoice.paidAt ? formatDate(invoice.paidAt) : LABELS.common.none}</span>
      ) : (
        <MarkPaidButton
          invoiceId={invoice.id}
          amountLabel={formatMAD(invoice.amountDue)}
          subjectName={invoice.subjectName}
          periodLabel={periodLabel(invoice)}
        />
      ),
  },
];

function PaymentsSection({ student }: { student: StudentFile }) {
  return (
    <SectionCard id="paiements" title={L.sections.payments}>
      {student.invoices.length === 0 ? (
        <EmptyState icon={Receipt} title={L.payments.emptyTitle} description={L.payments.emptyDescription} />
      ) : (
        <DataTable
          columns={PAYMENT_COLUMNS}
          rows={student.invoices}
          getRowId={(invoice) => invoice.id}
          caption={L.payments.caption}
          variant="plain"
        />
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------
// Absences
// ---------------------------------------------------------------------
function AbsencesSection({ student }: { student: StudentFile }) {
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
            <li key={absence.id} className="flex items-center justify-between gap-3 rounded-[10px] border px-3 py-2">
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
function FollowUpsSection({ student }: { student: StudentFile }) {
  return (
    <SectionCard id="relances" title={L.sections.followUps}>
      {student.followUps.length === 0 ? (
        <EmptyState icon={MessageSquareText} title={L.followUps.emptyTitle} description={L.followUps.emptyDescription} />
      ) : (
        <ol className="flex flex-col divide-y">
          {student.followUps.map((followUp) => (
            <li key={followUp.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium">{LABELS.followUp.types[followUp.type]}</span>
                <span className="text-caption text-muted-foreground">·</span>
                <span className="text-caption text-muted-foreground">{LABELS.followUp.channels[followUp.channel]}</span>
              </div>
              {followUp.note ? <p className="whitespace-pre-line">{followUp.note}</p> : null}
              <p className="text-caption text-muted-foreground">
                {formatDateTime(followUp.createdAt)}
                {followUp.authorName ? ` ${L.followUps.by(followUp.authorName)}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}
