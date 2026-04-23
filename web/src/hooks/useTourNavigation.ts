import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Draft, PRFile, PRRef } from "../types.ts";
import { fileStateOf } from "./useDraft.ts";

function stopStorageKey(ref: PRRef) {
  return `pr-tour:stop:${ref.owner}/${ref.repo}#${ref.number}`;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export type TourNavigation = {
  currentStop: number;
  totalStops: number;
  currentFile: PRFile | null;
  hasAnyAnnotations: boolean;
  canPrevAnn: boolean;
  canNextAnn: boolean;
  jumpTo: (stop: number) => void;
  prev: () => void;
  next: () => void;
  gotoAnnotation: (delta: 1 | -1) => void;
  toggleCurrentReviewed: () => void;
  isCollapsed: (path: string) => boolean;
  setCollapsed: (path: string, val: boolean) => void;
  toggleCollapsed: (path: string) => void;
  collapseCurrent: () => void;
  expandCurrent: () => void;
};

/**
 * Owns cursor state for the tour: which stop we're on (stop 0 = PR summary,
 * stop N = files[N-1]) plus a per-current-file annotation cursor for n/p.
 * Persists currentStop to localStorage keyed by PR. Calls scrollToId after
 * every move so the caller doesn't have to orchestrate scroll separately.
 *
 * Annotation navigation is intentionally scoped to the current file — n/p
 * never cross files. That keeps reviewers from jumping away without
 * realizing. Collapse state (file hidden below the header) is seeded from
 * the draft's reviewed set when the draft first loads so a reload of a
 * half-reviewed tour collapses the already-walked files.
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

  const [annCursor, setAnnCursor] = useState<number>(-1);

  const [collapsed, setCollapsedSet] = useState<Set<string>>(new Set());
  const seededCollapse = useRef(false);
  useEffect(() => {
    if (!draft || seededCollapse.current) return;
    seededCollapse.current = true;
    const initial = new Set<string>();
    for (const f of files) {
      if (fileStateOf(draft, f.path).reviewed) initial.add(f.path);
    }
    setCollapsedSet(initial);
  }, [draft, files]);

  const setCollapsed = useCallback((path: string, val: boolean) => {
    setCollapsedSet((prev) => {
      const has = prev.has(path);
      if (val === has) return prev;
      const next = new Set(prev);
      if (val) next.add(path);
      else next.delete(path);
      return next;
    });
  }, []);

  const toggleCollapsed = useCallback((path: string) => {
    setCollapsedSet((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const isCollapsed = useCallback(
    (path: string) => collapsed.has(path),
    [collapsed],
  );

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
      const leaving = currentStop > 0 ? files[currentStop - 1] : null;
      markCurrentReviewedOnLeave();
      if (leaving) setCollapsed(leaving.path, true);
      jumpTo(currentStop + 1);
    }
  }, [
    currentStop,
    files,
    totalStops,
    markCurrentReviewedOnLeave,
    setCollapsed,
    jumpTo,
  ]);

  const prev = useCallback(() => {
    if (currentStop > 0) jumpTo(currentStop - 1);
  }, [currentStop, jumpTo]);

  const currentFile: PRFile | null =
    currentStop > 0 ? (files[currentStop - 1] ?? null) : null;

  const currentAnnotations = currentFile?.annotations ?? [];

  const toggleCurrentReviewed = useCallback(() => {
    if (currentFile) toggleReviewed(currentFile.path);
  }, [currentFile, toggleReviewed]);

  const collapseCurrent = useCallback(() => {
    if (currentFile) setCollapsed(currentFile.path, true);
  }, [currentFile, setCollapsed]);

  const expandCurrent = useCallback(() => {
    if (currentFile) setCollapsed(currentFile.path, false);
  }, [currentFile, setCollapsed]);

  const gotoAnnotation = useCallback(
    (delta: 1 | -1) => {
      if (!currentFile || currentAnnotations.length === 0) return;
      const last = currentAnnotations.length - 1;
      let target: number;
      if (annCursor === -1) {
        target = delta === 1 ? 0 : last;
      } else {
        target = annCursor + delta;
      }
      if (target < 0 || target > last) return;
      // Expand the file so the annotation is actually visible — otherwise
      // we'd scroll to an id rendered inside a hidden block.
      setCollapsed(currentFile.path, false);
      setAnnCursor(target);
      const fileIndex = currentStop - 1;
      scrollToId(`ann-${fileIndex}-${target}`);
    },
    [
      currentFile,
      currentAnnotations.length,
      annCursor,
      currentStop,
      scrollToId,
      setCollapsed,
    ],
  );

  const hasAnyAnnotations = useMemo(
    () => files.some((f) => f.annotations.length > 0),
    [files],
  );

  const canPrevAnn =
    currentAnnotations.length > 0 && annCursor > 0;
  const canNextAnn =
    currentAnnotations.length > 0 &&
    annCursor < currentAnnotations.length - 1;

  return {
    currentStop,
    totalStops,
    currentFile,
    hasAnyAnnotations,
    canPrevAnn,
    canNextAnn,
    jumpTo,
    prev,
    next,
    gotoAnnotation,
    toggleCurrentReviewed,
    isCollapsed,
    setCollapsed,
    toggleCollapsed,
    collapseCurrent,
    expandCurrent,
  };
}
