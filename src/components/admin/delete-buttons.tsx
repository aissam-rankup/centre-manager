"use client";

import type { ReactElement } from "react";

import { ConfirmAction } from "@/components/shared/confirm-action";
import { deleteLevel, deletePack, deleteSlot, deleteSubject } from "@/lib/actions/admin";
import { LABELS } from "@/lib/constants/labels";

const C = LABELS.admin.common;
const L = LABELS.admin.subjects;

/**
 * Boutons de suppression confirmée. Les Server Actions sont liées ici, côté client,
 * pour pouvoir être déclenchées depuis des pages rendues par le serveur.
 */
export function DeleteLevelButton({ levelId, name, children }: { levelId: string; name: string; children: ReactElement }) {
  return (
    <ConfirmAction
      trigger={children}
      title={L.deleteLevel(name)}
      description={`${L.deleteLevelHint} ${C.irreversible}`}
      confirmLabel={C.delete}
      successMessage={C.deleted}
      action={() => deleteLevel(levelId)}
    />
  );
}

export function DeleteSubjectButton({ subjectId, name, children }: { subjectId: string; name: string; children: ReactElement }) {
  return (
    <ConfirmAction
      trigger={children}
      title={L.deleteSubject(name)}
      description={`${L.deleteSubjectHint} ${C.irreversible}`}
      confirmLabel={C.delete}
      successMessage={C.deleted}
      action={() => deleteSubject(subjectId)}
    />
  );
}

export function DeleteSlotButton({ slotId, label, children }: { slotId: string; label: string; children: ReactElement }) {
  return (
    <ConfirmAction
      trigger={children}
      title={C.deleteTitle}
      description={`${label} ${C.irreversible}`}
      confirmLabel={C.delete}
      successMessage={C.deleted}
      action={() => deleteSlot(slotId)}
    />
  );
}

export function DeletePackButton({ packId, name, children }: { packId: string; name: string; children: ReactElement }) {
  return (
    <ConfirmAction
      trigger={children}
      title={L.deletePack(name)}
      description={`${L.deletePackHint} ${C.irreversible}`}
      confirmLabel={C.delete}
      successMessage={C.deleted}
      action={() => deletePack(packId)}
    />
  );
}
