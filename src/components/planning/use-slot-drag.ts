"use client";

import { type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent, useCallback, useEffect, useRef, useState } from "react";

import { snapMinutes } from "@/lib/planning-grid";

/** Où le cours est lâché : un jour et une heure, un jour (onglet mobile), une salle ou un professeur. */
export type DropTarget = { kind: "time"; day: number; start: number } | { kind: "day"; day: number } | { kind: "entity"; id: string };

export type DragState = {
  slotId: string;
  x: number;
  y: number;
  /** Minutes entre le haut du cours et le point saisi : le cours suit le pointeur sans sauter. */
  offset: number;
  duration: number;
  target: DropTarget | null;
};

type Options = {
  pxPerMinute: number;
  rangeStart: number;
  rangeEnd: number;
  onDrop: (slotId: string, target: DropTarget) => void;
};

/** Distance avant de considérer un geste comme un glissement (souris). */
const DRAG_THRESHOLD = 6;
/** Appui long avant de saisir un cours au doigt : le défilement reste libre. */
const LONG_PRESS_MS = 350;
const AUTOSCROLL_EDGE = 64;

/** Défilement de la page pendant un glissement près du bord (zone principale sur ordinateur). */
function autoscroll(y: number) {
  const step = y < AUTOSCROLL_EDGE ? -14 : y > window.innerHeight - AUTOSCROLL_EDGE ? 14 : 0;
  if (step === 0) return;
  const main = document.getElementById("contenu");
  if (main && main.scrollHeight > main.clientHeight && getComputedStyle(main).overflowY !== "visible") main.scrollBy(0, step);
  else window.scrollBy(0, step);
}

/**
 * Glisser-déposer des cours au pointeur (souris, stylet, doigt). Les zones de dépôt se
 * déclarent par attributs : `data-drop-day` (colonne horaire d'un jour),
 * `data-drop-daytab` (onglet de jour) et `data-drop-entity` (salle ou professeur).
 */
export function useSlotDrag({ pxPerMinute, rangeStart, rangeEnd, onDrop }: Options) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  const resolveTarget = useCallback(
    (x: number, y: number, state: Pick<DragState, "offset" | "duration">): DropTarget | null => {
      const element = document.elementFromPoint(x, y);
      if (!(element instanceof HTMLElement)) return null;
      const entity = element.closest<HTMLElement>("[data-drop-entity]");
      if (entity?.dataset.dropEntity) return { kind: "entity", id: entity.dataset.dropEntity };
      const tab = element.closest<HTMLElement>("[data-drop-daytab]");
      if (tab?.dataset.dropDaytab) return { kind: "day", day: Number(tab.dataset.dropDaytab) };
      const column = element.closest<HTMLElement>("[data-drop-day]");
      if (!column?.dataset.dropDay) return null;
      const rect = column.getBoundingClientRect();
      const raw = rangeStart + (y - rect.top) / pxPerMinute - state.offset;
      const start = Math.min(Math.max(snapMinutes(raw), rangeStart), rangeEnd - state.duration);
      return { kind: "time", day: Number(column.dataset.dropDay), start };
    },
    [pxPerMinute, rangeStart, rangeEnd],
  );

  const update = (next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  const bind = (slot: { id: string; start: number; end: number }) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || dragRef.current) return;
      suppressClick.current = false;
      const rect = event.currentTarget.getBoundingClientRect();
      const offset = (event.clientY - rect.top) / pxPerMinute;
      const duration = slot.end - slot.start;
      const touch = event.pointerType === "touch";
      const origin = { x: event.clientX, y: event.clientY };
      let last = origin;
      let started = false;

      const begin = () => {
        started = true;
        const state: DragState = { slotId: slot.id, x: last.x, y: last.y, offset, duration, target: null };
        state.target = resolveTarget(last.x, last.y, state);
        document.body.style.userSelect = "none";
        if (touch) navigator.vibrate?.(10);
        update(state);
      };
      const timer = touch ? window.setTimeout(begin, LONG_PRESS_MS) : undefined;

      const move = (pointer: PointerEvent) => {
        last = { x: pointer.clientX, y: pointer.clientY };
        if (!started) {
          if (Math.hypot(last.x - origin.x, last.y - origin.y) < DRAG_THRESHOLD) return;
          // Au doigt, bouger avant l'appui long, c'est faire défiler la page.
          if (touch) cleanup();
          else begin();
          return;
        }
        autoscroll(last.y);
        const current = dragRef.current;
        if (current) update({ ...current, x: last.x, y: last.y, target: resolveTarget(last.x, last.y, current) });
      };
      const finish = (drop: boolean) => {
        const current = dragRef.current;
        cleanup();
        if (!started) return;
        // Le clic qui suit un glissement n'ouvre pas la fiche du cours.
        suppressClick.current = true;
        update(null);
        if (drop && current?.target) onDrop(current.slotId, current.target);
      };
      const up = () => finish(true);
      const cancel = () => finish(false);
      const key = (keyboard: KeyboardEvent) => {
        if (keyboard.key === "Escape") cancel();
      };
      // Pendant un glissement au doigt, la page ne défile pas.
      const touchMove = (touchEvent: TouchEvent) => {
        if (started) touchEvent.preventDefault();
      };

      function cleanup() {
        window.clearTimeout(timer);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        window.removeEventListener("keydown", key);
        document.removeEventListener("touchmove", touchMove);
        document.body.style.userSelect = "";
        cleanupRef.current = null;
      }

      cleanupRef.current?.();
      cleanupRef.current = cleanup;
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      window.addEventListener("keydown", key);
      document.addEventListener("touchmove", touchMove, { passive: false });
    },
    onClickCapture: (event: ReactMouseEvent<HTMLElement>) => {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    // L'appui long ne doit pas ouvrir le menu contextuel du téléphone.
    onContextMenu: (event: ReactMouseEvent<HTMLElement>) => {
      if (dragRef.current) event.preventDefault();
    },
  });

  return { drag, bind };
}
