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
    setLineComment,
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

  // Flat list of (fileIndex, annIdx) in file-then-line order — the sequence
  // we iterate through when the user presses n/p.
  const flatAnns = useMemo(() => {
    const out: { fileIndex: number; annIdx: number }[] = [];
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

  // Used by both "next step" and "jump to annotation in another file" — mark
  // the file we're leaving as reviewed, matching the j-key side-effect.
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
    [
      flatAnns,
      annCursor,
      currentStop,
      markCurrentReviewedOnLeave,
      scrollToId,
    ],
  );

  const openSubmit = useCallback(() => setSubmitOpen(true), []);

  // Keyboard shortcuts
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
      } else if (e.key === "n") {
        e.preventDefault();
        gotoAnnotation(1);
      } else if (e.key === "p") {
        e.preventDefault();
        gotoAnnotation(-1);
      } else if (e.key === "s" && files.length > 0) {
        e.preventDefault();
        openSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    next,
    prev,
    currentFile,
    toggleCurrentReviewed,
    gotoAnnotation,
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
              fileIndex={i}
              stopNum={i + 1}
              draft={draft}
              highlighter={highlighter}
              isActive={currentStop === i + 1}
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
        currentStop={currentStop}
        totalStops={totalStops}
        stopLabel={stopLabel}
        canMarkReviewed={!!currentFile}
        currentReviewed={currentReviewed}
        reviewedCount={reviewedCount}
        totalFiles={files.length}
        reviewSubmitted={reviewSubmitted}
        hasAnnotations={flatAnns.length > 0}
        canPrevAnn={flatAnns.length > 0}
        canNextAnn={flatAnns.length > 0}
        onPrev={prev}
        onNext={next}
        onPrevAnn={() => gotoAnnotation(-1)}
        onNextAnn={() => gotoAnnotation(1)}
        onToggleReviewed={toggleCurrentReviewed}
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

