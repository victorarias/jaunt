import { useEffect, useMemo, useState } from "react";
import { fetchPR, submitReview } from "./api.ts";
import type { PRPayload } from "./types.ts";
import { useDraft, fileStateOf } from "./hooks/useDraft.ts";
import { useHighlighter } from "./hooks/useHighlighter.ts";
import { TopBar } from "./components/TopBar.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { MainPanel } from "./components/MainPanel.tsx";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; pr: PRPayload };

export function App() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchPR()
      .then((pr) => {
        if (!cancelled) setState({ kind: "ready", pr });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : String(err),
          });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <div className="h-full flex items-center justify-center text-neutral-400">
        Loading PR…
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="h-full flex items-center justify-center text-red-400 font-mono text-sm">
        {state.message}
      </div>
    );
  }

  return <Review pr={state.pr} />;
}

function Review({ pr }: { pr: PRPayload }) {
  const highlighter = useHighlighter();
  const {
    draft,
    status,
    setOverallBody,
    toggleReviewed,
    setFileNote,
    clearLocal,
  } = useDraft(pr.meta.ref);

  const [selectedPath, setSelectedPath] = useState<string | null>(
    pr.files[0]?.path ?? null
  );
  const [submitting, setSubmitting] = useState(false);

  const selectedFile = useMemo(
    () => pr.files.find((f) => f.path === selectedPath) ?? null,
    [pr.files, selectedPath]
  );

  const reviewedCount = useMemo(() => {
    if (!draft) return 0;
    return pr.files.reduce(
      (acc, f) => acc + (fileStateOf(draft, f.path).reviewed ? 1 : 0),
      0
    );
  }, [draft, pr.files]);

  async function handleSubmit() {
    if (!draft) return;
    if (
      !confirm(
        "Push this review to GitHub? This will post a review comment with your overall note and per-file notes, then clear the local draft."
      )
    ) {
      return;
    }
    setSubmitting(true);
    try {
      const body = composeReviewBody(draft, pr);
      const result = await submitReview(body);
      if (result.ok) {
        clearLocal();
        alert(`Pushed to GitHub → ${result.url}`);
      } else {
        alert(`Submit failed: ${result.error}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!draft) {
    return (
      <div className="h-full flex items-center justify-center text-neutral-400">
        Loading draft…
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar
        meta={pr.meta}
        reviewedCount={reviewedCount}
        totalCount={pr.files.length}
        saveStatus={status}
        submitting={submitting}
        onSubmit={handleSubmit}
      />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          files={pr.files}
          tour={pr.tour}
          draft={draft}
          selectedPath={selectedPath}
          onSelect={setSelectedPath}
          overallBody={draft.overallBody}
          onOverallBodyChange={setOverallBody}
        />
        {selectedFile ? (
          <MainPanel
            file={selectedFile}
            draft={draft}
            highlighter={highlighter}
            onToggleReviewed={toggleReviewed}
            onNoteChange={setFileNote}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-neutral-500">
            Select a file from the sidebar to start.
          </div>
        )}
      </div>
    </div>
  );
}

function composeReviewBody(
  draft: { overallBody: string; fileStates: Record<string, { note: string }> },
  pr: PRPayload
): string {
  const parts: string[] = [];
  if (draft.overallBody.trim()) parts.push(draft.overallBody.trim());

  const perFile: string[] = [];
  for (const f of pr.files) {
    const st = draft.fileStates[f.path];
    if (st?.note.trim()) {
      perFile.push(`**${f.path}**\n\n${st.note.trim()}`);
    }
  }
  if (perFile.length > 0) {
    parts.push("---\n\n### Notes by file\n\n" + perFile.join("\n\n"));
  }

  if (parts.length === 0) return "_(review submitted with no notes)_";
  return parts.join("\n\n");
}
