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
        await saveDraft(toSave);
        // Intentionally do NOT setDraft(saved) / reassign latestDraft.current.
        // The server echo is stale by the time it arrives (the user may have
        // kept typing during the save round-trip), and nothing in the UI
        // reads updatedAt — so merging it back would only clobber keystrokes.
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

  const setAnnotationReply = useCallback(
    (path: string, annotationIdx: number, reply: string) =>
      mutate((d) => {
        const cur = fileStateOf(d, path);
        const nextReplies = { ...cur.replies };
        if (reply) nextReplies[String(annotationIdx)] = reply;
        else delete nextReplies[String(annotationIdx)];
        return {
          ...d,
          fileStates: {
            ...d.fileStates,
            [path]: { ...cur, replies: nextReplies },
          },
        };
      }),
    [mutate]
  );

  const setLineComment = useCallback(
    (path: string, line: number, text: string) =>
      mutate((d) => {
        const cur = fileStateOf(d, path);
        const next = { ...cur.lineComments };
        if (text) next[String(line)] = text;
        else delete next[String(line)];
        return {
          ...d,
          fileStates: {
            ...d.fileStates,
            [path]: { ...cur, lineComments: next },
          },
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

  /**
   * Clear the content that just got shipped (overall body, per-file notes,
   * thread replies, line comments) while keeping reviewed marks so the
   * reviewer can keep going without losing their progress. Persisted through
   * the normal debounced save so the server state matches.
   */
  const clearSubmittedContent = useCallback(() => {
    mutate((d) => ({
      ...d,
      overallBody: "",
      fileStates: Object.fromEntries(
        Object.entries(d.fileStates).map(([path, state]) => [
          path,
          { reviewed: state.reviewed, note: "", replies: {}, lineComments: {} },
        ]),
      ),
    }));
  }, [mutate]);

  return {
    draft,
    status,
    setOverallBody,
    toggleReviewed,
    setFileNote,
    setAnnotationReply,
    setLineComment,
    clearLocal,
    clearSubmittedContent,
  };
}

export function fileStateOf(draft: Draft, path: string): FileDraft {
  const existing = draft.fileStates[path];
  return {
    reviewed: existing?.reviewed ?? false,
    note: existing?.note ?? "",
    replies: existing?.replies ?? {},
    lineComments: existing?.lineComments ?? {},
  };
}
