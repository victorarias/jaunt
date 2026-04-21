import type { Draft, PRFile } from "../types.ts";
import { fileStateOf } from "../hooks/useDraft.ts";

type Props = {
  files: PRFile[];
  draft: Draft;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  overallBody: string;
  onOverallBodyChange: (body: string) => void;
};

export function Sidebar({
  files,
  draft,
  selectedPath,
  onSelect,
  overallBody,
  onOverallBodyChange,
}: Props) {
  return (
    <aside className="w-80 border-r border-neutral-800 flex flex-col overflow-hidden">
      <div className="p-3 border-b border-neutral-800">
        <label className="text-xs uppercase tracking-wide text-neutral-500">
          Overall review note
        </label>
        <textarea
          value={overallBody}
          onChange={(e) => onOverallBodyChange(e.target.value)}
          rows={4}
          placeholder="Summary shown at the top of the GitHub review…"
          className="mt-1 w-full bg-neutral-900 text-sm rounded-md border border-neutral-800 px-2 py-1.5 focus:outline-none focus:border-neutral-600 resize-none font-sans"
        />
      </div>

      <div className="px-3 py-2 text-xs uppercase tracking-wide text-neutral-500 border-b border-neutral-800">
        Files ({files.length})
      </div>

      <ul className="flex-1 overflow-auto text-sm">
        {files.map((f) => {
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
    </aside>
  );
}
