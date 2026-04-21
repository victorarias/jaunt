import type { Draft, PRFile, TourMeta } from "../types.ts";
import { fileStateOf } from "../hooks/useDraft.ts";

type Props = {
  files: PRFile[];
  tour: TourMeta | null;
  draft: Draft;
  currentStop: number;
  onJump: (stop: number) => void;
  overallBody: string;
  onOverallBodyChange: (body: string) => void;
};

export function Sidebar({
  files,
  tour,
  draft,
  currentStop,
  onJump,
  overallBody,
  onOverallBodyChange,
}: Props) {
  const reviewedCount = files.reduce(
    (n, f) => n + (fileStateOf(draft, f.path).reviewed ? 1 : 0),
    0,
  );
  const totalFiles = files.length || 1;
  const pct = Math.round((100 * reviewedCount) / totalFiles);

  const grouped = groupByTour(files);

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span>
          Tour · {reviewedCount}/{files.length} reviewed
        </span>
        <span style={{ color: "var(--fg-dimmer)" }}>{pct}%</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>

      {tour && tour.summary && (
        <div className="tour-summary">{tour.summary}</div>
      )}
      {tour?.warnings.map((w, i) => (
        <div key={i} className="tour-warning">
          ⚠ {w}
        </div>
      ))}

      <div className="file-list">
        <button
          type="button"
          className={`file-item ${currentStop === 0 ? "active" : ""}`}
          onClick={() => onJump(0)}
        >
          <span className="idx">00</span>
          <div>
            <div className="fname" style={{ color: "var(--fg-bright)" }}>
              PR summary
            </div>
            <div className="fmeta">
              <span>overview · review note</span>
            </div>
          </div>
          <span />
        </button>

        {grouped.tour.length > 0 && (
          <FileGroup
            label={`Tour · ${grouped.tour.length}`}
            files={grouped.tour}
            draft={draft}
            currentStop={currentStop}
            allFiles={files}
            onJump={onJump}
          />
        )}
        {grouped.other.length > 0 && (
          <FileGroup
            label={`Other · ${grouped.other.length}`}
            files={grouped.other}
            draft={draft}
            currentStop={currentStop}
            allFiles={files}
            onJump={onJump}
          />
        )}
        {grouped.skip.length > 0 && (
          <FileGroup
            label={`Skipped · ${grouped.skip.length}`}
            files={grouped.skip}
            draft={draft}
            currentStop={currentStop}
            allFiles={files}
            onJump={onJump}
            deemph
          />
        )}
      </div>

      <div className="overall-note">
        <label htmlFor="overall-body">Overall review note</label>
        <textarea
          id="overall-body"
          value={overallBody}
          onChange={(e) => onOverallBodyChange(e.target.value)}
          rows={3}
          placeholder="Shown at the top of the GitHub review…"
        />
      </div>
    </aside>
  );
}

function FileGroup({
  label,
  files,
  draft,
  currentStop,
  allFiles,
  onJump,
  deemph = false,
}: {
  label: string;
  files: PRFile[];
  draft: Draft;
  currentStop: number;
  allFiles: PRFile[];
  onJump: (stop: number) => void;
  deemph?: boolean;
}) {
  return (
    <>
      <div className="section-label">{label}</div>
      {files.map((f) => {
        const overallIdx = allFiles.indexOf(f);
        const stopNum = overallIdx + 1;
        const st = fileStateOf(draft, f.path);
        const active = currentStop === stopNum;
        const annCount = f.annotations.length;
        return (
          <button
            type="button"
            key={f.path}
            className={`file-item ${active ? "active" : ""} ${deemph ? "deemph" : ""} ${st.reviewed ? "reviewed" : ""}`}
            onClick={() => onJump(stopNum)}
          >
            <span className="idx">{String(stopNum).padStart(2, "0")}</span>
            <div style={{ minWidth: 0 }}>
              <div className="fname">{f.path}</div>
              <div className="fmeta">
                <span className="adds">+{f.additions}</span>
                <span className="dels">−{f.deletions}</span>
                {f.view === "content" && <span title="shown whole">◻ full</span>}
                {annCount > 0 && (
                  <span title={`${annCount} annotation${annCount === 1 ? "" : "s"}`}>
                    ◔ {annCount}
                  </span>
                )}
                {st.note.trim() && (
                  <span className="note-dot" title="has note">
                    ●
                  </span>
                )}
              </div>
            </div>
            <span />
          </button>
        );
      })}
    </>
  );
}

function groupByTour(files: PRFile[]): {
  tour: PRFile[];
  other: PRFile[];
  skip: PRFile[];
} {
  const tour: PRFile[] = [];
  const other: PRFile[] = [];
  const skip: PRFile[] = [];
  for (const f of files) {
    if (f.tourGroup === "tour") tour.push(f);
    else if (f.tourGroup === "skip") skip.push(f);
    else other.push(f);
  }
  return { tour, other, skip };
}
