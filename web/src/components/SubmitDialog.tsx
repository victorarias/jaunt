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
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
            <p style={{ fontFamily: "var(--sans)" }}>
              {outcome.target === "github" ? (
                <>
                  Your review was posted to GitHub. The local draft has been
                  cleared.
                </>
              ) : (
                <>
                  Your feedback was written locally. The invoking agent can
                  read the file at the path below.
                </>
              )}
            </p>
            <div className="submitted-meta">
              <div>
                <span>verdict</span>
                <b className={`verdict-${view.verdict}`}>
                  {view.verdict.replace("_", " ")}
                </b>
              </div>
              <div>
                <span>target</span>
                <b>
                  {outcome.target === "github" ? "GitHub" : "agent (local)"}
                </b>
              </div>
              <div>
                <span>files walked</span>
                <b>
                  {view.reviewedCount}/{view.totalFiles}
                </b>
              </div>
              <div>
                <span>body</span>
                <b>{view.body.length} chars</b>
              </div>
              {outcome.target === "github" && (
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
              )}
              {outcome.target === "agent" && (
                <div>
                  <span>path</span>
                  <b style={{ wordBreak: "break-all" }}>{outcome.path}</b>
                </div>
              )}
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>
              Close
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
            <label>Send to</label>
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
              ).map((v) => (
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
          </button>
        </div>
      </div>
    </div>
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
