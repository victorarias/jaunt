import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchPR, submitReview } from "./api.ts";
import type { PRFile, PRPayload, PRRef, SubmitTarget } from "./types.ts";
import { composeReviewBody, type Verdict } from "../../src/compose.ts";
import { fileStateOf, useDraft } from "./hooks/useDraft.ts";
import { useHighlighter } from "./hooks/useHighlighter.ts";
import { TopBar } from "./components/TopBar.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { SummaryCard } from "./components/SummaryCard.tsx";
import { FileCard } from "./components/FileCard.tsx";
import { DriveBar } from "./components/DriveBar.tsx";
import {
  SubmitDialog,
  type SubmitOutcome,
} from "./components/SubmitDialog.tsx";

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
    return <div className="status-msg">Loading PR…</div>;
  }
  if (state.kind === "error") {
    return <div className="status-msg error">{state.message}</div>;
  }
  return <Review pr={state.pr} />;
}

function stopStorageKey(ref: PRRef) {
  return `pr-tour:stop:${ref.owner}/${ref.repo}#${ref.number}`;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function Review({ pr }: { pr: PRPayload }) {
  const highlighter = useHighlighter();
  const {
    draft,
    status,
    setOverallBody,
    toggleReviewed,
    setFileNote,
    setAnnotationReply,
    clearLocal,
  } = useDraft(pr.meta.ref);

  const files = pr.files;
  const totalStops = files.length + 1;

  const stopKey = stopStorageKey(pr.meta.ref);
  const [currentStop, setCurrentStop] = useState<number>(() => {
    const raw = window.localStorage.getItem(stopKey);
    const n = raw == null ? 0 : parseInt(raw, 10);
    return Number.isFinite(n) ? clamp(n, 0, Math.max(0, totalStops - 1)) : 0;
  });
  const [submitOpen, setSubmitOpen] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(stopKey, String(currentStop));
  }, [currentStop, stopKey]);

  const mainRef = useRef<HTMLDivElement>(null);

  const scrollToStop = useCallback((stop: number) => {
    const id = `stop-${stop}`;
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      const scroller = mainRef.current;
      if (el && scroller) {
        const top =
          el.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop -
          12;
        scroller.scrollTo({ top, behavior: "smooth" });
      }
    });
  }, []);

  const jumpTo = useCallback(
    (stop: number) => {
      const next = clamp(stop, 0, totalStops - 1);
      setCurrentStop(next);
      scrollToStop(next);
    },
    [scrollToStop, totalStops],
  );

  const next = useCallback(() => {
    if (currentStop < totalStops - 1) {
      // Mark the current file reviewed as we leave it.
      if (currentStop > 0 && draft) {
        const f = files[currentStop - 1];
        if (f && !fileStateOf(draft, f.path).reviewed) {
          toggleReviewed(f.path);
        }
      }
      jumpTo(currentStop + 1);
    }
  }, [currentStop, totalStops, files, draft, toggleReviewed, jumpTo]);

  const prev = useCallback(() => {
    if (currentStop > 0) jumpTo(currentStop - 1);
  }, [currentStop, jumpTo]);

  const currentFile: PRFile | null =
    currentStop > 0 ? (files[currentStop - 1] ?? null) : null;

  const toggleCurrentReviewed = useCallback(() => {
    if (currentFile) toggleReviewed(currentFile.path);
  }, [currentFile, toggleReviewed]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (submitOpen) return;
      const tgt = e.target as HTMLElement | null;
      if (
        tgt &&
        (tgt.tagName === "INPUT" ||
          tgt.tagName === "TEXTAREA" ||
          tgt.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j" || e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "k" || e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === "r" && currentFile) {
        e.preventDefault();
        toggleCurrentReviewed();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, currentFile, toggleCurrentReviewed, submitOpen]);

  const reviewedCount = useMemo(() => {
    if (!draft) return 0;
    return files.reduce(
      (n, f) => n + (fileStateOf(draft, f.path).reviewed ? 1 : 0),
      0,
    );
  }, [draft, files]);

  async function handleSubmit(
    verdict: Verdict,
    body: string,
    target: SubmitTarget,
  ): Promise<SubmitOutcome> {
    if (!draft) throw new Error("Draft not loaded");
    const composed = composeReviewBody(verdict, body, draft, files);
    const result = await submitReview(composed, target);
    if (!result.ok) throw new Error(result.error);
    setReviewSubmitted(true);
    clearLocal();
    return result.target === "github"
      ? { target: "github", url: result.url }
      : { target: "agent", path: result.path };
  }

  if (!draft) {
    return <div className="status-msg">Loading draft…</div>;
  }

  const stopLabel =
    currentStop === 0
      ? "PR summary"
      : (files[currentStop - 1]?.path ?? "—");
  const currentReviewed = currentFile
    ? fileStateOf(draft, currentFile.path).reviewed
    : false;

  return (
    <div className="app">
      <TopBar
        meta={pr.meta}
        reviewedCount={reviewedCount}
        totalCount={files.length}
        saveStatus={status}
      />

      <Sidebar
        files={files}
        tour={pr.tour}
        draft={draft}
        currentStop={currentStop}
        onJump={jumpTo}
        overallBody={draft.overallBody}
        onOverallBodyChange={setOverallBody}
      />

      <main className="main" ref={mainRef}>
        <div className="main-inner">
          <SummaryCard meta={pr.meta} files={files} tour={pr.tour} />
          {files.map((f, i) => (
            <FileCard
              key={f.path}
              file={f}
              stopNum={i + 1}
              draft={draft}
              highlighter={highlighter}
              isActive={currentStop === i + 1}
              onToggleReviewed={toggleReviewed}
              onNoteChange={setFileNote}
              onSetReply={setAnnotationReply}
            />
          ))}
          {files.length > 0 && (
            <div
              style={{
                padding: "32px 4px",
                color: "var(--fg-dimmer)",
                fontSize: 12,
                textAlign: "center",
              }}
            >
              — end of tour —{" "}
              <span style={{ color: "var(--accent)" }}>
                {reviewedCount === files.length
                  ? `all ${files.length} files walked`
                  : `${reviewedCount}/${files.length} files walked`}
              </span>
            </div>
          )}
        </div>
      </main>

      <DriveBar
        currentStop={currentStop}
        totalStops={totalStops}
        stopLabel={stopLabel}
        canMarkReviewed={!!currentFile}
        currentReviewed={currentReviewed}
        reviewedCount={reviewedCount}
        totalFiles={files.length}
        reviewSubmitted={reviewSubmitted}
        onPrev={prev}
        onNext={next}
        onToggleReviewed={toggleCurrentReviewed}
        onOpenSubmit={() => setSubmitOpen(true)}
      />

      <div className="kbd-help">
        <span className="kbd">J</span>/<span className="kbd">→</span> next ·
        <span className="kbd">K</span>/<span className="kbd">←</span> prev ·
        <span className="kbd">R</span> reviewed
      </div>

      {submitOpen && (
        <SubmitDialog
          files={files}
          draft={draft}
          onClose={() => setSubmitOpen(false)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

