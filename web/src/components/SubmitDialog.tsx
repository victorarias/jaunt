import { useEffect, useState } from "react";
import type { Draft, PRFile, SubmitTarget } from "../types.ts";
import { fileStateOf } from "../hooks/useDraft.ts";
import type { Verdict } from "../../../src/compose.ts";

export type { Verdict };

export type SubmitOutcome =
  | { target: "github"; url: string }
  | { target: "agent"; path: string };

type Props = {
  files: PRFile[];
  draft: Draft;
  onClose: () => void;
  onSubmit: (
    verdict: Verdict,
    body: string,
    target: SubmitTarget,
  ) => Promise<SubmitOutcome>;
};

type View =
  | { kind: "form" }
  | { kind: "submitting" }
  | {
      kind: "done";
      verdict: Verdict;
      body: string;
      reviewedCount: number;
      totalFiles: number;
      outcome: SubmitOutcome;
    }
  | { kind: "error"; message: string };

export function SubmitDialog({ files, draft, onClose, onSubmit }: Props) {
  const [view, setView] = useState<View>({ kind: "form" });
  const [verdict, setVerdict] = useState<Verdict>("approve");
  const [target, setTarget] = useState<SubmitTarget>("github");
  const [body, setBody] = useState(draft.overallBody);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // ⌘/Ctrl+Enter submits from anywhere (textarea included).
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (view.kind === "form") void handleSubmit();
        return;
      }
      // Letter/number shortcuts: skip when the user is typing in a field.
      const tgt = e.target as HTMLElement | null;
      const typing =
        tgt &&
        (tgt.tagName === "INPUT" ||
          tgt.tagName === "TEXTAREA" ||
          tgt.isContentEditable);
      if (typing) return;
      if (view.kind !== "form") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "1") {
        e.preventDefault();
        setVerdict("approve");
      } else if (e.key === "2") {
        e.preventDefault();
        setVerdict("comment");
      } else if (e.key === "3") {
        e.preventDefault();
        setVerdict("request_changes");
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        setTarget((prev) => (prev === "github" ? "agent" : "github"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // handleSubmit is defined below and depends on verdict/body/target, but
    // the listener reads the latest via closure-on-rerender, not deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, view.kind]);

  const reviewedCount = files.reduce(
    (n, f) => n + (fileStateOf(draft, f.path).reviewed ? 1 : 0),
    0,
  );
  const missing = files.filter((f) => !fileStateOf(draft, f.path).reviewed);
  const pct = files.length > 0 ? (100 * reviewedCount) / files.length : 0;

  async function handleSubmit() {
    const snapshotReviewed = reviewedCount;
    const snapshotTotal = files.length;
    setView({ kind: "submitting" });
    try {
      const outcome = await onSubmit(verdict, body, target);
      setView({
        kind: "done",
        verdict,
        body,
        reviewedCount: snapshotReviewed,
        totalFiles: snapshotTotal,
        outcome,
      });
    } catch (err) {
      setView({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (view.kind === "done") {
    const { outcome } = view;
    const { ref } = draft;
    return (
      <div
        className="modal-backdrop"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal success" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <span className="success-glyph">✓</span>
            <span>
              {outcome.target === "github"
                ? "Review submitted"
                : "Feedback saved for agent"}
            </span>
          </div>
          <div className="modal-body">
            {outcome.target === "github" ? (
              <>
                <p style={{ fontFamily: "var(--sans)" }}>
                  Your review was posted to GitHub. The local draft has been
                  cleared.
                </p>
                <div className="submitted-meta">
                  <div>
                    <span>verdict</span>
                    <b className={`verdict-${view.verdict}`}>
                      {view.verdict.replace("_", " ")}
                    </b>
                  </div>
                  <div>
                    <span>url</span>
                    <b>
                      <a
                        href={outcome.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ wordBreak: "break-all" }}
                      >
                        {outcome.url}
                      </a>
                    </b>
                  </div>
                </div>
              </>
            ) : (
              <AgentPromptPanel
                path={outcome.path}
                ownerRepoNumber={`${ref.owner}/${ref.repo}#${ref.number}`}
              />
            )}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>
              Close
              <span className="kbd">Esc</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const busy = view.kind === "submitting";

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>Submit review</span>
          <button type="button" className="close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>
              Send to <span className="opt">toggle with <span className="kbd">T</span></span>
            </label>
            <div className="seg wide">
              <button
                type="button"
                className={target === "github" ? "active" : ""}
                onClick={() => setTarget("github")}
              >
                <span className="glyph">◐</span> GitHub
              </button>
              <button
                type="button"
                className={target === "agent" ? "active" : ""}
                onClick={() => setTarget("agent")}
              >
                <span className="glyph">▲</span> back to agent
              </button>
            </div>
            <div className="hint">
              {target === "github"
                ? "Posts a review comment on the pull request with your verdict and notes."
                : "Writes the composed feedback to ~/.pr-tour/<ref>.feedback.md so the invoking agent can pick it up."}
            </div>
          </div>

          <div className="field">
            <label>Verdict</label>
            <div className="verdicts">
              {(
                [
                  {
                    id: "approve",
                    label: "Approve",
                    sub: "LGTM — ready to merge",
                    color: "accent",
                  },
                  {
                    id: "comment",
                    label: "Comment",
                    sub: "Thoughts only, no blocker",
                    color: "info",
                  },
                  {
                    id: "request_changes",
                    label: "Request changes",
                    sub: "Needs revision before merge",
                    color: "risk",
                  },
                ] as const
              ).map((v, i) => (
                <button
                  key={v.id}
                  type="button"
                  className={`verdict-btn ${v.color} ${verdict === v.id ? "active" : ""}`}
                  onClick={() => setVerdict(v.id)}
                >
                  <span className="radio">{verdict === v.id ? "●" : "○"}</span>
                  <span>
                    <b>{v.label}</b>
                    <small>{v.sub}</small>
                  </span>
                  <span className="kbd verdict-kbd">{i + 1}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>
              Summary comment <span className="opt">(becomes the review body)</span>
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={placeholderFor(verdict)}
              rows={4}
            />
            <div className="hint">
              Your per-file notes and thread replies are appended automatically
              under “Notes by file”.
            </div>
          </div>

          <div className="coverage">
            <div className="coverage-bar">
              <div className="coverage-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="coverage-text">
              <b>{reviewedCount}</b> of <b>{files.length}</b> files marked
              reviewed
              {missing.length > 0 && (
                <div className="missing">
                  not yet walked:{" "}
                  {missing.map((f) => basename(f.path)).join(", ")}
                </div>
              )}
            </div>
          </div>

          {view.kind === "error" && (
            <div
              className="tour-warning"
              style={{ margin: "12px 0 0", color: "var(--risk)" }}
            >
              Submit failed: {view.message}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
            <span className="kbd">Esc</span>
          </button>
          <button
            type="button"
            className={`btn primary verdict-${verdict}`}
            onClick={handleSubmit}
            disabled={busy}
          >
            {busy
              ? "Submitting…"
              : target === "github"
                ? "Post to GitHub →"
                : "Send to agent →"}
            {!busy && <span className="kbd">⌘↵</span>}
          </button>
        </div>
      </div>
    </div>
  );
}

function agentPrompt(ownerRepoNumber: string, path: string): string {
  return [
    `I finished reviewing ${ownerRepoNumber} via pr-tour.`,
    ``,
    `Read the feedback file at:`,
    `  ${path}`,
    ``,
    `It contains a verdict (Approve / Comment / Request changes), an optional summary, per-file notes, and line-pinned comments written as "_on line N:_". Work through the notes and comments in file order — address each point in code or reply briefly explaining why you won't. If the verdict is "Approve", no changes are needed.`,
  ].join("\n");
}

function AgentPromptPanel({
  ownerRepoNumber,
  path,
}: {
  ownerRepoNumber: string;
  path: string;
}) {
  const [copied, setCopied] = useState(false);
  const prompt = agentPrompt(ownerRepoNumber, path);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API may be unavailable on insecure origins; select fallback.
      const el = document.getElementById(
        "agent-prompt-text",
      ) as HTMLTextAreaElement | null;
      if (el) {
        el.select();
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    }
  }

  return (
    <>
      <p style={{ fontFamily: "var(--sans)" }}>
        Your feedback was written locally. Copy the prompt below and paste it
        into the agent session that should act on the review.
      </p>
      <div className="agent-prompt">
        <div className="agent-prompt-head">
          <span>agent prompt</span>
          <button
            type="button"
            className="btn sm"
            onClick={handleCopy}
            aria-label="Copy prompt"
          >
            {copied ? "✓ copied" : "Copy"}
          </button>
        </div>
        <textarea
          id="agent-prompt-text"
          readOnly
          value={prompt}
          rows={8}
          onFocus={(e) => e.currentTarget.select()}
        />
      </div>
    </>
  );
}

function placeholderFor(v: Verdict): string {
  if (v === "approve") return "LGTM. Small suggestion inline; otherwise ship it.";
  if (v === "request_changes")
    return "Please address the comments before merging.";
  return "Leaving a few notes for future-us — not a blocker.";
}

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}
