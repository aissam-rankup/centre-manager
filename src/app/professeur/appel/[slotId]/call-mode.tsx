"use client";

import { Check, ChevronLeft, ChevronRight, ListChecks, LoaderCircle, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type PointerEvent, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { StudentAvatar } from "@/components/shared/student-avatar";
import { Button } from "@/components/ui/button";
import { saveAttendance } from "@/lib/actions/teacher";
import { ROUTES } from "@/lib/auth/routes";
import { LABELS } from "@/lib/constants/labels";
import type { CallStudent, TeacherSlot } from "@/lib/data/teacher";
import { cn } from "@/lib/utils";

const L = LABELS.teacher.call;
type Mark = "present" | "absent";
type Marks = Record<string, Mark | null>;

/** Distance minimale (px) d'un glissement horizontal pour changer d'élève. */
const SWIPE_THRESHOLD = 60;

type CallModeProps = {
  slot: TeacherSlot;
  students: CallStudent[];
};

export function CallMode({ slot, students }: CallModeProps) {
  const router = useRouter();
  const initialMarks = useMemo<Marks>(
    () => Object.fromEntries(students.map((student) => [student.id, student.status])),
    [students],
  );
  const alreadyDone = students.every((student) => student.status !== null);

  const [marks, setMarks] = useState<Marks>(initialMarks);
  const [index, setIndex] = useState(() => Math.max(0, students.findIndex((student) => student.status === null)));
  const [view, setView] = useState<"cards" | "summary">(alreadyDone ? "summary" : "cards");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const total = students.length;
  const markedCount = students.filter((student) => marks[student.id]).length;
  const presentCount = students.filter((student) => marks[student.id] === "present").length;
  const absentCount = markedCount - presentCount;
  const dirty = students.some((student) => marks[student.id] !== initialMarks[student.id]);
  const current = students[index];

  const goTo = useCallback((target: number) => setIndex(Math.min(Math.max(target, 0), total - 1)), [total]);

  const mark = useCallback(
    (status: Mark) => {
      if (!current) return;
      const next: Marks = { ...marks, [current.id]: status };
      setMarks(next);
      setError(null);
      // Élève suivant non marqué (en boucle) ; récapitulatif quand tout le monde est marqué.
      for (let step = 1; step <= total; step += 1) {
        const candidate = (index + step) % total;
        const student = students[candidate];
        if (student && !next[student.id]) {
          setIndex(candidate);
          return;
        }
      }
      setView("summary");
    },
    [current, index, marks, students, total],
  );

  // Clavier : flèches pour naviguer, P / A pour marquer.
  useEffect(() => {
    if (view !== "cards") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea")) return;
      if (event.key === "ArrowRight") goTo(index + 1);
      else if (event.key === "ArrowLeft") goTo(index - 1);
      else if (event.key.toLowerCase() === "p") mark("present");
      else if (event.key.toLowerCase() === "a") mark("absent");
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [view, index, goTo, mark]);

  // Glissement horizontal sur la carte : élève précédent / suivant.
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (event: PointerEvent) => {
    swipeStart.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: PointerEvent) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
    goTo(dx < 0 ? index + 1 : index - 1);
  };

  const toggle = (studentId: string) => {
    setError(null);
    setMarks((previous) => ({ ...previous, [studentId]: previous[studentId] === "present" ? "absent" : "present" }));
  };

  const submit = () => {
    if (markedCount < total) {
      setError(L.errors.incomplete);
      return;
    }
    const entries = students.flatMap((student) => {
      const status = marks[student.id];
      return status ? [{ studentId: student.id, status }] : [];
    });
    startTransition(async () => {
      const result = await saveAttendance({ slotId: slot.id, entries });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(L.success, { description: L.successDescription(presentCount, absentCount) });
      router.push(ROUTES.teacher.home);
      router.refresh();
    });
  };

  const close = () => {
    if (dirty && !window.confirm(L.closeConfirm)) return;
    router.push(ROUTES.teacher.home);
  };

  const progress = total === 0 ? 0 : Math.round((markedCount / total) * 100);

  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* En-tête : séance, progression, sortie */}
      <header className="border-b bg-card px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 md:px-6">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Button variant="ghost" size="icon" className="-ml-2" onClick={close} aria-label={L.close}>
            <X aria-hidden />
          </Button>
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="truncate text-body font-semibold">
              {slot.subjectName} · {slot.levelName}
            </h1>
            <p className="numeric truncate text-caption font-normal text-muted-foreground">
              {LABELS.teacher.schedule.time(slot.startTime, slot.endTime)} · {slot.room}
            </p>
          </div>
          <span className="numeric shrink-0 text-caption" aria-hidden>
            {L.marked(markedCount, total)}
          </span>
        </div>
        <div
          className="mx-auto mt-3 h-2 max-w-2xl overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={markedCount}
          aria-valuetext={L.marked(markedCount, total)}
        >
          <div className="h-full rounded-full bg-success transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
      </header>

      {view === "cards" && current ? (
        <>
          <main className="flex flex-1 flex-col overflow-y-auto">
            <div
              className="mx-auto flex w-full max-w-2xl flex-1 touch-pan-y items-center gap-2 px-2 py-6 select-none md:px-6"
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={() => (swipeStart.current = null)}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={() => goTo(index - 1)}
                disabled={index === 0}
                aria-label={L.previous}
              >
                <ChevronLeft aria-hidden />
              </Button>

              <div key={current.id} className="flex flex-1 animate-in flex-col items-center gap-4 text-center fade-in-0 duration-200">
                <p className="numeric text-caption font-normal text-muted-foreground" aria-live="polite">
                  {L.progress(index + 1, total)}
                </p>
                <StudentAvatar
                  name={current.fullName}
                  photoUrl={current.photoUrl}
                  size="call"
                  status={marks[current.id] === "present" ? "upToDate" : marks[current.id] === "absent" ? "overdue" : "neutral"}
                />
                <h2 className="text-title">{current.fullName}</h2>
                <MarkBadge mark={marks[current.id] ?? null} />
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => goTo(index + 1)}
                disabled={index === total - 1}
                aria-label={L.next}
              >
                <ChevronRight aria-hidden />
              </Button>
            </div>
          </main>

          {/* Actions dans la zone du pouce */}
          <footer className="border-t bg-card px-4 pt-4 pb-[max(env(safe-area-inset-bottom),16px)] md:px-6">
            <div className="mx-auto flex max-w-2xl flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="danger"
                  size="call"
                  onClick={() => mark("absent")}
                  aria-pressed={marks[current.id] === "absent"}
                  aria-keyshortcuts="A"
                >
                  <X aria-hidden />
                  {L.absent}
                </Button>
                <Button
                  variant="success"
                  size="call"
                  onClick={() => mark("present")}
                  aria-pressed={marks[current.id] === "present"}
                  aria-keyshortcuts="P"
                >
                  <Check aria-hidden />
                  {L.present}
                </Button>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="hidden text-caption text-muted-foreground sm:block">{L.hint}</p>
                <Button variant="ghost" className="ml-auto" onClick={() => setView("summary")}>
                  <ListChecks aria-hidden />
                  {L.summary.title}
                </Button>
              </div>
            </div>
          </footer>
        </>
      ) : (
        <>
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6 md:px-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-section">{L.summary.title}</h2>
                <p className="text-muted-foreground">{L.summary.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <CountPill tone="success">{L.summary.presentCount(presentCount)}</CountPill>
                <CountPill tone="danger">{L.summary.absentCount(absentCount)}</CountPill>
                {markedCount < total ? <CountPill tone="neutral">{L.summary.missing(total - markedCount)}</CountPill> : null}
              </div>
              <ul className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-soft">
                {students.map((student) => {
                  const studentMark = marks[student.id] ?? null;
                  const statusLabel = studentMark ? L[studentMark] : L.notMarked;
                  return (
                    <li key={student.id} className="border-b last:border-b-0">
                      <button
                        type="button"
                        onClick={() => toggle(student.id)}
                        aria-label={L.summary.toggle(student.fullName, statusLabel)}
                        className="flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-muted/60"
                      >
                        <StudentAvatar
                          name={student.fullName}
                          photoUrl={student.photoUrl}
                          status={studentMark === "present" ? "upToDate" : studentMark === "absent" ? "overdue" : "neutral"}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">{student.fullName}</span>
                        <MarkBadge mark={studentMark} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </main>

          <footer className="border-t bg-card px-4 pt-4 pb-[max(env(safe-area-inset-bottom),16px)] md:px-6">
            <div className="mx-auto flex max-w-2xl flex-col gap-3">
              {error ? (
                <p role="alert" className="rounded-[10px] bg-danger/10 px-4 py-3 text-danger-ink">
                  {error}
                </p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <Button variant="outline" size="call" className="order-2 sm:order-1" onClick={() => setView("cards")} disabled={pending}>
                  <RotateCcw aria-hidden />
                  {L.summary.back}
                </Button>
                <Button size="call" className="order-1 sm:order-2" onClick={submit} disabled={pending}>
                  {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Check aria-hidden />}
                  {pending ? L.summary.submitting : L.summary.submit}
                </Button>
              </div>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}

function MarkBadge({ mark }: { mark: Mark | null }) {
  const tone = mark === "present" ? "success" : mark === "absent" ? "danger" : "neutral";
  return <CountPill tone={tone}>{mark ? L[mark] : L.notMarked}</CountPill>;
}

function CountPill({ tone, children }: { tone: "success" | "danger" | "neutral"; children: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-caption font-medium whitespace-nowrap",
        tone === "success" && "bg-success/10 text-success-ink",
        tone === "danger" && "bg-danger/10 text-danger-ink",
        tone === "neutral" && "bg-muted text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          tone === "success" ? "bg-success" : tone === "danger" ? "bg-danger" : "bg-muted-foreground",
        )}
        aria-hidden
      />
      {children}
    </span>
  );
}
