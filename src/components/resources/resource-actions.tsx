"use client";

import { Eye, EyeOff, LoaderCircle, Pencil, Trash2 } from "lucide-react";
import Link from "@/components/shared/app-link";
import { useTransition } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { Button } from "@/components/ui/button";
import { deleteResource, setResourcePublished } from "@/lib/actions/resources";
import { ROUTES } from "@/lib/auth/routes";
import { useLabels, useMessage } from "@/lib/i18n/client";

/** Modifier, publier ou dépublier, supprimer une ressource du professeur. */
export function ResourceActions({ id, isPublished, hasFile }: { id: string; isPublished: boolean; hasFile: boolean }) {
  const LABELS = useLabels();
  const message = useMessage();
  const L = LABELS.resources;
  const [pending, startTransition] = useTransition();

  const togglePublished = () =>
    startTransition(async () => {
      const result = await setResourcePublished({ id, published: !isPublished });
      if (result.ok) toast.success(isPublished ? L.unpublishedToast : L.publishedToast);
      else toast.error(message(result.error));
    });

  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline">
        <Link href={ROUTES.teacher.resource(id)}>
          <Pencil aria-hidden />
          {L.edit}
        </Link>
      </Button>
      {hasFile ? (
        <Button type="button" variant="outline" disabled={pending} onClick={togglePublished}>
          {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : isPublished ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          {isPublished ? L.unpublish : L.publish}
        </Button>
      ) : null}
      <ConfirmAction
        trigger={
          <Button type="button" variant="ghost" className="text-danger-ink">
            <Trash2 aria-hidden />
            {L.delete}
          </Button>
        }
        title={L.deleteTitle}
        description={L.deleteDescription}
        confirmLabel={L.delete}
        successMessage={L.deleted}
        action={() => deleteResource({ id })}
      />
    </div>
  );
}
