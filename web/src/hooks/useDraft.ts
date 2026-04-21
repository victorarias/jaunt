import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDraft, saveDraft } from "../api.ts";
import type { Draft, FileDraft, PRRef } from "../types.ts";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export function useDraft(ref: PRRef | null) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDraft = useRef<Draft | null>(null);

  useEffect(() => {
    if (!ref) return;
    let cancelled = false;
    fetchDraft().then((d) => {
      if (cancelled) return;
      setDraft(d);
      latestDraft.current = d;
    });
    return () => {
      cancelled = true;
    };
  }, [ref]);

  const schedulePersist = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setStatus("saving");
    saveTimer.current = setTimeout(async () => {
      const toSave = latestDraft.current;
      if (!toSave) return;
      try {
        const saved = await saveDraft(toSave);
        latestDraft.current = saved;
        setDraft(saved);
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    }, 400);
  }, []);

  const mutate = useCallback(
    (updater: (prev: Draft) => Draft) => {
      setDraft((prev) => {
        if (!prev) return prev;
        const next = updater(prev);
        latestDraft.current = next;
        return next;
      });
      schedulePersist();
    },
    [schedulePersist]
  );

  const setOverallBody = useCallback(
    (body: string) => mutate((d) => ({ ...d, overallBody: body })),
    [mutate]
  );

  const toggleReviewed = useCallback(
    (path: string) =>
      mutate((d) => {
        const cur = fileStateOf(d, path);
        return {
          ...d,
          fileStates: {
            ...d.fileStates,
            [path]: { ...cur, reviewed: !cur.reviewed },
          },
        };
      }),
    [mutate]
  );

  const setFileNote = useCallback(
    (path: string, note: string) =>
      mutate((d) => {
        const cur = fileStateOf(d, path);
        return {
          ...d,
          fileStates: { ...d.fileStates, [path]: { ...cur, note } },
        };
      }),
    [mutate]
  );

  const clearLocal = useCallback(() => {
    setDraft((d) => (d ? { ...d, overallBody: "", fileStates: {} } : d));
    latestDraft.current = draft
      ? { ...draft, overallBody: "", fileStates: {} }
      : null;
  }, [draft]);

  return {
    draft,
    status,
    setOverallBody,
    toggleReviewed,
    setFileNote,
    clearLocal,
  };
}

export function fileStateOf(draft: Draft, path: string): FileDraft {
  return draft.fileStates[path] ?? { reviewed: false, note: "" };
}
