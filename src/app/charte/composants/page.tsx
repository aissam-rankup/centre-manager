import { AlertTriangle, CalendarX, Check, ClipboardCheck, Save, Wallet, X } from "lucide-react";
import type { Metadata } from "next";

import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { StudentAvatar } from "@/components/shared/student-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LABELS } from "@/lib/constants/labels";
import { formatDate, formatPercent } from "@/lib/format";

import { Section } from "../section";

const L = LABELS.styleguide;

export const metadata: Metadata = { title: L.components.title };

// Données fictives de démonstration — remplacées par Supabase à partir de la phase 2.
type DemoRow = {
  id: string;
  name: string;
  level: string;
  amount: number;
  dueDate: string;
  status: "upToDate" | "overdue";
};

const DEMO_ROWS: readonly DemoRow[] = [
  { id: "1", name: "Yassine El Amrani", level: "2ème année BAC Sciences", amount: 600, dueDate: "2026-09-05", status: "overdue" },
  { id: "2", name: "Salma Bennani", level: "1ère année BAC", amount: 450, dueDate: "2026-10-05", status: "upToDate" },
  { id: "3", name: "Omar Tazi", level: "Tronc commun", amount: 300, dueDate: "2026-09-12", status: "overdue" },
];

const COLUMNS: readonly DataTableColumn<DemoRow>[] = [
  {
    id: "student",
    header: L.table.student,
    mobile: "title",
    cell: (row) => (
      <span className="flex items-center gap-3">
        <StudentAvatar name={row.name} status={row.status} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.name}</span>
          <span className="truncate text-caption text-muted-foreground md:hidden">{row.level}</span>
        </span>
      </span>
    ),
  },
  { id: "level", header: L.table.level, mobile: "hidden", cell: (row) => row.level },
  { id: "amount", header: L.table.amount, align: "end", cell: (row) => <Money amount={row.amount} /> },
  { id: "dueDate", header: L.table.dueDate, cell: (row) => <span className="numeric font-normal">{formatDate(row.dueDate)}</span> },
  { id: "status", header: L.table.status, mobile: "aside", cell: (row) => <StatusBadge status={row.status} /> },
];

export default function ComponentsPage() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader title={L.components.title} description={L.components.description} />

      <Section title={L.sections.buttons}>
        <Card>
          <CardContent className="flex flex-wrap gap-3">
            <Button>
              <Save aria-hidden />
              {L.buttons.primary}
            </Button>
            <Button variant="highlight">
              <ClipboardCheck aria-hidden />
              {L.buttons.highlight}
            </Button>
            <Button variant="secondary">{L.buttons.secondary}</Button>
            <Button variant="outline">{L.buttons.outline}</Button>
            <Button variant="ghost">{L.buttons.ghost}</Button>
            <Button variant="destructive">{L.buttons.destructive}</Button>
            <Button variant="link">{L.buttons.link}</Button>
          </CardContent>
        </Card>
      </Section>

      <Section title={L.sections.callButtons}>
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <Button variant="success" size="call">
            <Check aria-hidden />
            {LABELS.status.present}
          </Button>
          <Button variant="danger" size="call">
            <X aria-hidden />
            {LABELS.status.absent}
          </Button>
        </div>
      </Section>

      <Section title={L.sections.badges}>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status="upToDate" />
          <StatusBadge status="overdue" />
          <StatusBadge status="present" />
          <StatusBadge status="absent" />
          <StatusBadge status="absence" />
          <StatusBadge status="followUp" />
          <StatusBadge status="pending" />
        </div>
      </Section>

      <Section title={L.sections.avatars}>
        <Card>
          <CardContent className="flex flex-wrap items-end gap-8">
            <figure className="flex flex-col items-center gap-2">
              <StudentAvatar name="Salma Bennani" status="upToDate" size="list" />
              <figcaption className="text-caption text-muted-foreground">{L.avatars.list}</figcaption>
            </figure>
            <figure className="flex flex-col items-center gap-2">
              <StudentAvatar name="Yassine El Amrani" status="overdue" size="profile" />
              <figcaption className="text-caption text-muted-foreground">{L.avatars.profile}</figcaption>
            </figure>
            <figure className="flex flex-col items-center gap-2">
              <StudentAvatar name="Omar Tazi" status="neutral" size="call" />
              <figcaption className="text-caption text-muted-foreground">{L.avatars.call}</figcaption>
            </figure>
          </CardContent>
        </Card>
      </Section>

      <Section title={L.sections.table}>
        <DataTable columns={COLUMNS} rows={DEMO_ROWS} getRowId={(row) => row.id} caption={L.sections.table} />
      </Section>

      <Section title={L.sections.stats}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label={L.stats.collected}
            value={<Money amount={48600} />}
            icon={Wallet}
            tone="success"
            hint={`+${formatPercent(0.082)} ${L.stats.vsLastMonth}`}
          />
          <StatCard label={L.stats.expected} value={<Money amount={56200} />} icon={Wallet} tone="brand" />
          <StatCard label={L.stats.unpaid} value="14" icon={AlertTriangle} tone="danger" />
          <StatCard label={L.stats.absencesToday} value="6" icon={CalendarX} tone="warning" />
        </div>
      </Section>
    </div>
  );
}
