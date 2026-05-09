import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAgentReplies,
  fetchPR,
  refetchContent,
  sendAgentQuestion,
  submitReview,
} from "./api.ts";
import type {
  AgentAskContext,
  AgentReplies,
  PRPayload,
  SubmitTarget,
} from "./types.ts";
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
import { AgentChannel } from "./components/AgentChannel.tsx";
import { AgentRepliesPanel } from "./components/AgentRepliesPanel.tsx";
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
  const [askOpen, setAskOpen] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [agentReplies, setAgentReplies] = useState<AgentReplies | null>(null);
  const [agentWaitBaseline, setAgentWaitBaseline] = useState<
    string | null | undefined
  >(undefined);

  const mainRef = useRef<HTMLDivElement>(null);

  const scrollToId = useCallback(
    (id: string, align: "top" | "center" = "top") => {
      requestAnimationFrame(() => {
        const el = document.getElementById(id);
        const scroller = mainRef.current;
        if (!el || !scroller) return;
        const elTop =
          el.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop;
        const top =
          align === "center" ? elTop - scroller.clientHeight / 2 : elTop - 12;
        scroller.scrollTo({ top, behavior: "smooth" });
        el.classList.remove("flash");
        void (el as HTMLElement).offsetWidth;
        el.classList.add("flash");
        el.addEventListener(
          "animationend",
          () => el.classList.remove("flash"),
          { once: true },
        );
      });
    },
    [],
  );

  const nav = useTourNavigation({
    ref: pr.meta.ref,
    files,
    draft,
    toggleReviewed,
    scrollToId,
  });

  const openSubmit = useCallback(() => setSubmitOpen(true), []);
  const openAsk = useCallback(() => setAskOpen(true), []);

  useEffect(() => {
    let cancelled = false;
    async function loadReplies() {
      try {
        const next = await fetchAgentReplies();
        if (cancelled) return;
        setAgentReplies(next);
        if (
          agentWaitBaseline !== undefined &&
          next.body.trim() &&
          next.updatedAt !== agentWaitBaseline
        ) {
          setAgentWaitBaseline(undefined);
        }
      } catch {
        // Agent replies are advisory; don't block the review surface if the
        // local exchange file cannot be read for a moment.
      }
    }

    void loadReplies();
    const id = window.setInterval(loadReplies, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [agentWaitBaseline]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (submitOpen || askOpen) return;
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
      } else if (e.key === "a" && files.length > 0) {
        e.preventDefault();
        openAsk();
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
    openAsk,
    submitOpen,
    askOpen,
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
      if (result.target === "agent") {
        setAgentWaitBaseline(agentReplies?.updatedAt ?? null);
      }
    }
    return result.target === "github"
      ? { target: "github", url: result.url, finish: result.finish }
      : {
          target: "agent",
          path: result.path,
          responsePath: result.responsePath,
          finish: result.finish,
        };
  }

  const sendAskToAgent = useCallback(
    async (context: AgentAskContext, body: string): Promise<void> => {
      const payload = formatAgentQuestion(context, body);
      const result = await sendAgentQuestion(payload);
      if (!result.ok) throw new Error(result.error);
      if (result.target === "agent") {
        setAgentWaitBaseline(agentReplies?.updatedAt ?? null);
        setAskOpen(true);
      }
    },
    [agentReplies?.updatedAt],
  );

  async function handleAgentQuestion(body: string): Promise<void> {
    const context: AgentAskContext = {
      path: nav.currentFile?.path ?? "PR summary",
      source: "quick",
    };
    await sendAskToAgent(context, body);
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
          <AgentRepliesPanel
            replies={agentReplies}
            waiting={agentWaitBaseline !== undefined}
          />
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
              onAskAgent={sendAskToAgent}
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
        canNext={nav.canNext}
        canPrevAnn={nav.canPrevAnn}
        canNextAnn={nav.canNextAnn}
        onPrev={nav.prev}
        onNext={nav.next}
        onPrevAnn={() => nav.gotoAnnotation(-1)}
        onNextAnn={() => nav.gotoAnnotation(1)}
        onToggleReviewed={nav.toggleCurrentReviewed}
        onOpenAsk={openAsk}
        onOpenSubmit={openSubmit}
      />

      {askOpen && (
        <AgentChannel
          contextLabel={
            nav.currentFile ? `Current file: ${nav.currentFile.path}` : "PR summary"
          }
          replies={agentReplies}
          waiting={agentWaitBaseline !== undefined}
          onClose={() => setAskOpen(false)}
          onSend={handleAgentQuestion}
        />
      )}

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

function formatAgentQuestion(context: AgentAskContext, body: string): string {
  const location =
    context.lineStart === undefined
      ? context.path
      : context.lineEnd && context.lineEnd !== context.lineStart
        ? `${context.path}:${context.lineStart}-${context.lineEnd}`
        : `${context.path}:${context.lineStart}`;
  const parts = [
    "**Question for agent**",
    "",
    `_Context: ${location}_`,
  ];

  if (context.code?.trim()) {
    parts.push("", "Selected code:", "", "```", context.code, "```");
  }

  parts.push("", body);
  return parts.join("\n");
}
