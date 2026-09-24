import { UserX } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/auth/routes";
import { LABELS } from "@/lib/constants/labels";

const L = LABELS.assistant.student;

export default function StudentNotFound() {
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
