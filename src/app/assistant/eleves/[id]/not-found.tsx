import { UserX } from "lucide-react";
import Link from "@/components/shared/app-link";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/auth/routes";
import { getLabels } from "@/lib/i18n/server";


export default async function StudentNotFound() {
  const LABELS = await getLabels();
  const L = LABELS.assistant.student;
  return (
    <EmptyState
      icon={UserX}
      title={L.notFoundTitle}
      description={L.notFoundDescription}
      action={
        <Button asChild>
          <Link href={ROUTES.assistant.students}>{L.back}</Link>
        </Button>
      }
    />
  );
}
