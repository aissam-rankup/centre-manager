"use client";

import { LoaderCircle, PenLine } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { setAttendanceNote } from "@/lib/actions/attendance";
import { useLabels, useMessage } from "@/lib/i18n/client";

/** Saisie du motif d'une absence (ex. « certificat médical reçu »). */
export function AttendanceNote({ attendanceId, note, dateLabel }: { attendanceId: string; note: string | null; dateLabel: string }) {
  const LABELS = useLabels();
  const message = useMessage();
  const L = LABELS.attendanceSheet;
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(note ?? "");
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setValue(note ?? "");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" className="h-8 px-2 text-caption" aria-label={L.editNoteLabel(dateLabel)}>
          <PenLine className="size-4" aria-hidden />
          {L.editNote}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const result = await setAttendanceNote({ attendanceId, note: value });
              if (!result.ok) {
                toast.error(message(result.error));
                return;
              }
              toast.success(L.noteSaved);
              setOpen(false);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-section">{L.editNoteLabel(dateLabel)}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`note-${attendanceId}`}>{L.note}</Label>
            <Textarea
              id={`note-${attendanceId}`}
              rows={3}
              maxLength={300}
              value={value}
              placeholder={L.notePlaceholder}
              onChange={(event) => setValue(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {LABELS.common.cancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
              {LABELS.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
