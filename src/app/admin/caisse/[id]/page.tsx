import { ArrowLeft, FileDown } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { CorrectCashSessionButton, ValidateCashSessionButton } from "@/components/cash/cash-admin-actions";
import { SessionPanel } from "@/components/cash/cash-view";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/auth/routes";
import { requireRole } from "@/lib/auth/session";
import { getCashSessionSummary } from "@/lib/data/cash";
import { formatDate } from "@/lib/format";
import { getLabels } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLabels()).nav.cash };
}

/** Détail d'une session de caisse (admin) : clôture si elle est encore ouverte, correction, validation, rapport. */
export default async function AdminCashSessionPage({ params }: PageProps<"/admin/caisse/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const profile = await requireRole("admin");
  if (profile.support) notFound();
  const LABELS = await getLabels();
  const A = LABELS.cash.admin;
  const session = await getCashSessionSummary(id).catch(() => null);
  if (!session) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={A.detailTitle(formatDate(session.sessionDate))}
        actions={
          <>
            <Button asChild variant="ghost" className="min-h-11">
              <Link href={ROUTES.admin.cash}>
                <ArrowLeft aria-hidden />
                {A.backToCash}
              </Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11">
              <a href={`${ROUTES.admin.cash}/rapport/${session.sessionDate}`} target="_blank" rel="noopener">
                <FileDown aria-hidden />
                {A.report}
              </a>
            </Button>
            {session.status === "closed" ? (
              <>
                <CorrectCashSessionButton sessionId={session.id} />
                <ValidateCashSessionButton sessionId={session.id} />
              </>
            ) : null}
          </>
        }
      />
      <SessionPanel session={session} LABELS={LABELS} fileBase={ROUTES.admin.students} />
    </div>
  );
}
