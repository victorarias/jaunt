import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchPR, refetchContent, submitReview } from "./api.ts";
import type { PRPayload, SubmitTarget } from "./types.ts";
import { composeReviewBody, type Verdict } from "../../src/compose.ts";
import { fileStateOf, useDraft } from "./hooks/useDraft.ts";
import { useHighlighter } from "./hooks/useHighlighter.ts";
import { useTourNavigation } from "./hooks/useTourNavigation.ts";
import { isTypingInField } from "./lib/dom.ts";
import { TopBar } from "./components/TopBar.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { SummaryCard } from "./components/SummaryCard.tsx";
import { FileCard } from "./components/FileCard.tsx";
import { DriveBar } from "./components/DriveBar.tsx";
import { ErrorBanner } from "./components/ErrorBanner.tsx";
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
  return (
    <Review
      pr={state.pr}
      onUpdate={(pr) => setState({ kind: "ready", pr })}
    />
  );
}

function Review({
  pr,
  onUpdate,
}: {
  pr: PRPayload;
  onUpdate: (pr: PRPayload) => void;
}) {
  const highlighter = useHighlighter();
  const {
    draft,
    status,
    setOverallBody,
    toggleReviewed,
    setFileNote,
    setAnnotationReply,
    setLineComment,
    clearLocal,
    clearSubmittedContent,
  } = useDraft(pr.meta.ref);

  const files = pr.files;
  const [submitOpen, setSubmitOpen] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  const mainRef = useRef<HTMLDivElement>(null);

  const scrollToId = useCallback((id: string) => {
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

  const nav = useTourNavigation({
    ref: pr.meta.ref,
    files,
    draft,
    toggleReviewed,
    scrollToId,
  });

  const openSubmit = useCallback(() => setSubmitOpen(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (submitOpen) return;
      // Cmd/Ctrl+Enter from anywhere (textareas included) opens the submit
      // dialog — so reviewers can hit "send it" right after typing a comment
      // without having to blur out first.
      if (
        e.key === "Enter" &&
        (e.metaKey || e.ctrlKey) &&
        files.length > 0
      ) {
        e.preventDefault();
        openSubmit();
        return;
      }
      if (isTypingInField(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j") {
        e.preventDefault();
        nav.next();
      } else if (e.key === "k") {
        e.preventDefault();
        nav.prev();
      } else if (e.key === "ArrowRight" && nav.currentFile) {
        e.preventDefault();
        nav.expandCurrent();
      } else if (e.key === "ArrowLeft" && nav.currentFile) {
        e.preventDefault();
        nav.collapseCurrent();
      } else if (e.key === "r" && nav.currentFile) {
        e.preventDefault();
        nav.toggleCurrentReviewed();
      } else if (e.key === "n" && nav.canNextAnn) {
        e.preventDefault();
        nav.gotoAnnotation(1);
      } else if (e.key === "p" && nav.canPrevAnn) {
        e.preventDefault();
        nav.gotoAnnotation(-1);
      } else if (e.key === "s" && files.length > 0) {
        e.preventDefault();
        openSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    nav.next,
    nav.prev,
    nav.currentFile,
    nav.toggleCurrentReviewed,
    nav.gotoAnnotation,
    nav.expandCurrent,
    nav.collapseCurrent,
    nav.canNextAnn,
    nav.canPrevAnn,
    openSubmit,
    submitOpen,
    files.length,
  ]);

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
    finish: boolean,
  ): Promise<SubmitOutcome> {
    if (!draft) throw new Error("Draft not loaded");
    const composed = composeReviewBody(verdict, body, draft, files);
    const result = await submitReview(composed, target, finish);
    if (!result.ok) throw new Error(result.error);
    if (finish) {
      setReviewSubmitted(true);
      clearLocal();
    } else {
      // Mid-review submit: wipe the content we just shipped so the next
      // submit is "what's new since", but keep reviewed marks intact.
      clearSubmittedContent();
    }
    return result.target === "github"
      ? { target: "github", url: result.url, finish: result.finish }
      : { target: "agent", path: result.path, finish: result.finish };
  }

  if (!draft) {
    return <div className="status-msg">Loading draft…</div>;
  }

  const stopLabel =
    nav.currentStop === 0
      ? "PR summary"
      : (files[nav.currentStop - 1]?.path ?? "—");
  const currentReviewed = nav.currentFile
    ? fileStateOf(draft, nav.currentFile.path).reviewed
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
        currentStop={nav.currentStop}
        onJump={nav.jumpTo}
        overallBody={draft.overallBody}
        onOverallBodyChange={setOverallBody}
      />

      <main className="main" ref={mainRef}>
        <div className="main-inner">
          {pr.tour && pr.tour.fileErrors.length > 0 && (
            <ErrorBanner
              fileErrors={pr.tour.fileErrors}
              onRetry={async (paths) => {
                const updated = await refetchContent(paths);
                onUpdate(updated);
              }}
            />
          )}
          <SummaryCard meta={pr.meta} files={files} tour={pr.tour} />
          {files.map((f, i) => (
            <FileCard
              key={f.path}
              file={f}
              fileIndex={i}
              stopNum={i + 1}
              draft={draft}
              highlighter={highlighter}
              isActive={nav.currentStop === i + 1}
              collapsed={nav.isCollapsed(f.path)}
              onToggleCollapsed={nav.toggleCollapsed}
              onToggleReviewed={toggleReviewed}
              onNoteChange={setFileNote}
              onSetReply={setAnnotationReply}
              onSetLineComment={setLineComment}
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
        currentStop={nav.currentStop}
        totalStops={nav.totalStops}
        stopLabel={stopLabel}
        canMarkReviewed={!!nav.currentFile}
        currentReviewed={currentReviewed}
        reviewedCount={reviewedCount}
        totalFiles={files.length}
        reviewSubmitted={reviewSubmitted}
        hasAnnotations={nav.hasAnyAnnotations}
        canPrevAnn={nav.canPrevAnn}
        canNextAnn={nav.canNextAnn}
        onPrev={nav.prev}
        onNext={nav.next}
        onPrevAnn={() => nav.gotoAnnotation(-1)}
        onNextAnn={() => nav.gotoAnnotation(1)}
        onToggleReviewed={nav.toggleCurrentReviewed}
        onOpenSubmit={openSubmit}
      />

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
