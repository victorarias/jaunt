import { useCallback, useEffect, useMemo, useState } from "react";
import type { Draft, PRFile, PRRef } from "../types.ts";
import { fileStateOf } from "./useDraft.ts";

function stopStorageKey(ref: PRRef) {
  return `pr-tour:stop:${ref.owner}/${ref.repo}#${ref.number}`;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

type FlatAnn = { fileIndex: number; annIdx: number };

export type TourNavigation = {
  currentStop: number;
  totalStops: number;
  currentFile: PRFile | null;
  flatAnns: FlatAnn[];
  canPrevAnn: boolean;
  canNextAnn: boolean;
  jumpTo: (stop: number) => void;
  prev: () => void;
  next: () => void;
  gotoAnnotation: (delta: 1 | -1) => void;
  toggleCurrentReviewed: () => void;
};

/**
 * Owns cursor state for the tour: which stop we're on (stop 0 = PR summary,
 * stop N = files[N-1]) plus a secondary annotation cursor for n/p navigation.
 * Persists currentStop to localStorage keyed by PR. Calls scrollToId after
 * every move so the caller doesn't have to orchestrate scroll separately.
 *
 * Both `next()` and cross-file `gotoAnnotation()` auto-mark the file we're
 * leaving as reviewed, matching the J keyboard shortcut's side-effect.
 */
export function useTourNavigation(opts: {
  ref: PRRef;
  files: PRFile[];
  draft: Draft | null;
  toggleReviewed: (path: string) => void;
  scrollToId: (id: string) => void;
}): TourNavigation {
  const { ref, files, draft, toggleReviewed, scrollToId } = opts;
  const totalStops = files.length + 1;
  const storageKey = stopStorageKey(ref);

  const [currentStop, setCurrentStop] = useState<number>(() => {
    const raw = window.localStorage.getItem(storageKey);
    const n = raw == null ? 0 : parseInt(raw, 10);
    return Number.isFinite(n) ? clamp(n, 0, Math.max(0, totalStops - 1)) : 0;
  });

  useEffect(() => {
    window.localStorage.setItem(storageKey, String(currentStop));
  }, [currentStop, storageKey]);

  const flatAnns = useMemo<FlatAnn[]>(() => {
    const out: FlatAnn[] = [];
    files.forEach((f, fi) => {
      f.annotations.forEach((_, ai) => {
        out.push({ fileIndex: fi, annIdx: ai });
      });
    });
    return out;
  }, [files]);
  const [annCursor, setAnnCursor] = useState<number>(-1);

  const jumpTo = useCallback(
    (stop: number) => {
      const nextStop = clamp(stop, 0, totalStops - 1);
      setCurrentStop(nextStop);
      setAnnCursor(-1);
      scrollToId(`stop-${nextStop}`);
    },
    [scrollToId, totalStops],
  );

  const markCurrentReviewedOnLeave = useCallback(() => {
    if (currentStop > 0 && draft) {
      const f = files[currentStop - 1];
      if (f && !fileStateOf(draft, f.path).reviewed) {
        toggleReviewed(f.path);
      }
    }
  }, [currentStop, files, draft, toggleReviewed]);

  const next = useCallback(() => {
    if (currentStop < totalStops - 1) {
      markCurrentReviewedOnLeave();
      jumpTo(currentStop + 1);
    }
  }, [currentStop, totalStops, markCurrentReviewedOnLeave, jumpTo]);

  const prev = useCallback(() => {
    if (currentStop > 0) jumpTo(currentStop - 1);
  }, [currentStop, jumpTo]);

  const currentFile: PRFile | null =
    currentStop > 0 ? (files[currentStop - 1] ?? null) : null;

  const toggleCurrentReviewed = useCallback(() => {
    if (currentFile) toggleReviewed(currentFile.path);
  }, [currentFile, toggleReviewed]);

  const gotoAnnotation = useCallback(
    (delta: 1 | -1) => {
      if (flatAnns.length === 0) return;
      let target = annCursor + delta;
      if (annCursor === -1) {
        // Cursor was reset (e.g., by jumpTo). Seek relative to currentStop.
        const here = currentStop === 0 ? -1 : currentStop - 1;
        if (delta === 1) {
          target = flatAnns.findIndex((a) => a.fileIndex >= here);
        } else {
          target = -1;
          for (let i = flatAnns.length - 1; i >= 0; i--) {
            if (flatAnns[i]!.fileIndex <= here) {
              target = i;
              break;
            }
          }
        }
      }
      if (target < 0 || target >= flatAnns.length) return;
      const ann = flatAnns[target]!;
      const targetStop = ann.fileIndex + 1;
      if (targetStop !== currentStop) {
        markCurrentReviewedOnLeave();
        setCurrentStop(targetStop);
      }
      setAnnCursor(target);
      scrollToId(`ann-${ann.fileIndex}-${ann.annIdx}`);
    },
    [flatAnns, annCursor, currentStop, markCurrentReviewedOnLeave, scrollToId],
  );

  return {
    currentStop,
    totalStops,
    currentFile,
    flatAnns,
    canPrevAnn: flatAnns.length > 0,
    canNextAnn: flatAnns.length > 0,
    jumpTo,
    prev,
    next,
    gotoAnnotation,
    toggleCurrentReviewed,
  };
}
