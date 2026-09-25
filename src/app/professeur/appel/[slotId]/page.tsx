import { CalendarX2, SearchX, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { z } from "zod";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/auth/routes";
import { LABELS } from "@/lib/constants/labels";
import { getCallSheet } from "@/lib/data/teacher";

import { CallMode } from "./call-mode";

const L = LABELS.teacher.call;

export const metadata: Metadata = { title: LABELS.teacher.home.takeAttendance };

export default async function CallPage({ params }: PageProps<"/professeur/appel/[slotId]">) {
  const { slotId } = await params;
  const sheet = z.uuid().safeParse(slotId).success ? await getCallSheet(slotId) : null;

  if (!sheet) return <Fallback icon={SearchX} title={L.notFoundTitle} description={L.notFoundDescription} />;
  if (!sheet.isToday) return <Fallback icon={CalendarX2} title={L.notTodayTitle} description={L.notTodayDescription} />;
  if (sheet.students.length === 0) return <Fallback icon={Users} title={L.emptyTitle} description={L.emptyDescription} />;

  return <CallMode slot={sheet.slot} students={sheet.students} />;
}

function Fallback({ icon, title, description }: { icon: typeof Users; title: string; description: string }): ReactNode {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <EmptyState
        icon={icon}
        title={title}
        description={description}
        className="w-full max-w-md"
        action={
          <Button asChild>
            <Link href={ROUTES.teacher.home}>{L.backHome}</Link>
          </Button>
        }
      />
    </main>
  );
}
