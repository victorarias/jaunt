import type { PRMeta, PRFile, TourMeta } from "../types.ts";
import { Markdown } from "./Markdown.tsx";

type Props = {
  meta: PRMeta;
  files: PRFile[];
  tour: TourMeta | null;
};

export function SummaryCard({ meta, files, tour }: Props) {
  const additions = files.reduce((n, f) => n + f.additions, 0);
  const deletions = files.reduce((n, f) => n + f.deletions, 0);

  return (
    <div className="summary-card" id="stop-0">
      <div className="shead">
        <span className="num">#00</span>
        <span className="title">{meta.title}</span>
      </div>
      <div className="sbody">
        {tour?.summary && (
          <>
            <h3>Tour summary</h3>
            <Markdown source={tour.summary} className="prose" />
          </>
        )}

        <h3>PR description</h3>
        {meta.body.trim() ? (
          <Markdown source={meta.body} className="prose" />
        ) : (
          <p className="prose">
            <span style={{ color: "var(--fg-dimmer)" }}>
              No description provided.
            </span>
          </p>
        )}

        {tour && tour.warnings.length > 0 && (
          <>
            <h3>Watch out for</h3>
            <div className="callouts">
              {tour.warnings.map((w, i) => (
                <div key={i} className="callout">
                  <span className="badge" />
                  <div>{w}</div>
                </div>
              ))}
            </div>
          </>
        )}

        <h3>Reading order</h3>
        <p style={{ color: "var(--fg-dim)" }}>
          {files.length === 0
            ? "No files in this PR."
            : `Walk ${files.length} file${files.length === 1 ? "" : "s"} in order — use `}
          {files.length > 0 && (
            <>
              <span className="kbd">J</span> / <span className="kbd">→</span> to
              advance, <span className="kbd">K</span> /{" "}
              <span className="kbd">←</span> to go back, and{" "}
              <span className="kbd">R</span> to mark reviewed.
            </>
          )}
        </p>
      </div>
      <div className="meta-strip">
        <span>
          <b>{files.length}</b> files changed
        </span>
        <span className="adds">
          <b>+{additions}</b> additions
        </span>
        <span className="dels">
          <b>−{deletions}</b> deletions
        </span>
        <span>
          branch <b>{meta.headRef}</b> → <b>{meta.baseRef}</b>
        </span>
        <span>#{meta.ref.number}</span>
      </div>
    </div>
  );
}
