import type { Draft, PRFile, TourMeta } from "../types.ts";
import { fileStateOf } from "../hooks/useDraft.ts";

type Props = {
  files: PRFile[];
  tour: TourMeta | null;
  draft: Draft;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  overallBody: string;
  onOverallBodyChange: (body: string) => void;
};

export function Sidebar({
  files,
  tour,
  draft,
  selectedPath,
  onSelect,
  overallBody,
  onOverallBodyChange,
}: Props) {
  const grouped = groupByTour(files);

  return (
    <aside className="w-80 border-r border-neutral-800 flex flex-col overflow-hidden">
      <div className="p-3 border-b border-neutral-800">
        <label className="text-xs uppercase tracking-wide text-neutral-500">
          Overall review note
        </label>
        <textarea
          value={overallBody}
          onChange={(e) => onOverallBodyChange(e.target.value)}
          rows={3}
          placeholder="Summary shown at the top of the GitHub review…"
          className="mt-1 w-full bg-neutral-900 text-sm rounded-md border border-neutral-800 px-2 py-1.5 focus:outline-none focus:border-neutral-600 resize-none font-sans"
        />
      </div>

      {tour && (tour.summary || tour.warnings.length > 0) && (
        <div className="p-3 border-b border-neutral-800 space-y-2">
          {tour.summary && (
            <div className="text-xs text-neutral-400 whitespace-pre-wrap leading-relaxed">
              {tour.summary}
            </div>
          )}
          {tour.warnings.map((w, i) => (
            <div
              key={i}
              className="text-[11px] text-amber-400/80 bg-amber-500/5 border border-amber-500/20 rounded px-2 py-1"
            >
              ⚠ {w}
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-auto text-sm">
        {grouped.tour.length > 0 && (
          <FileGroup
            label={`Tour (${grouped.tour.length})`}
            tone="tour"
            files={grouped.tour}
            draft={draft}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        )}
        {grouped.other.length > 0 && (
          <FileGroup
            label={
              grouped.tour.length + grouped.skip.length > 0
                ? `Other files (${grouped.other.length})`
                : `Files (${grouped.other.length})`
            }
            tone="other"
            files={grouped.other}
            draft={draft}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        )}
        {grouped.skip.length > 0 && (
          <FileGroup
            label={`Skipped (${grouped.skip.length})`}
            tone="skip"
            files={grouped.skip}
            draft={draft}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        )}
      </div>
    </aside>
  );
}

function FileGroup({
  label,
  tone,
  files,
  draft,
  selectedPath,
  onSelect,
}: {
  label: string;
  tone: "tour" | "other" | "skip";
  files: PRFile[];
  draft: Draft;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const dim = tone === "skip" ? "opacity-50" : "";
  return (
    <div>
      <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-neutral-500 bg-neutral-900/40 sticky top-0">
        {label}
      </div>
      <ul className={dim}>
        {files.map((f, idx) => {
          const { reviewed, note } = fileStateOf(draft, f.path);
          const selected = f.path === selectedPath;
          return (
            <li key={f.path}>
              <button
                type="button"
                onClick={() => onSelect(f.path)}
                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 border-l-2 transition-colors ${
                  selected
                    ? "bg-neutral-900 border-emerald-500"
                    : "border-transparent hover:bg-neutral-900/50"
                }`}
              >
                {tone === "tour" && (
                  <span className="w-5 text-[10px] tabular-nums text-neutral-500 flex-none text-right">
                    {idx + 1}.
                  </span>
                )}
                <span
                  className={`w-4 h-4 rounded-full border flex-none ${
                    reviewed
                      ? "bg-emerald-500 border-emerald-500"
                      : "border-neutral-600"
                  }`}
                  aria-label={reviewed ? "reviewed" : "unreviewed"}
                />
                <span className="flex-1 truncate font-mono text-xs">
                  {f.path}
                </span>
                {note ? (
                  <span className="text-[10px] text-amber-400" title="has note">
                    ●
                  </span>
                ) : null}
                <span className="text-[10px] tabular-nums text-neutral-500 flex-none">
                  <span className="text-green-400">+{f.additions}</span>{" "}
                  <span className="text-red-400">−{f.deletions}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
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
