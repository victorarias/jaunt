import type { Draft, PRFile } from "../types.ts";
import { fileStateOf } from "../hooks/useDraft.ts";
import { DiffView } from "./DiffView.tsx";
import { ContentView } from "./ContentView.tsx";
import type { Highlighter } from "../hooks/useHighlighter.ts";

type Props = {
  file: PRFile;
  draft: Draft;
  highlighter: Highlighter | null;
  onToggleReviewed: (path: string) => void;
  onNoteChange: (path: string, note: string) => void;
};

export function MainPanel({
  file,
  draft,
  highlighter,
  onToggleReviewed,
  onNoteChange,
}: Props) {
  const { reviewed, note } = fileStateOf(draft, file.path);

  return (
    <section className="flex-1 flex flex-col overflow-hidden">
      <div className="border-b border-neutral-800 px-4 py-2.5 flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={() => onToggleReviewed(file.path)}
            className="w-4 h-4 accent-emerald-500"
          />
          <span className="text-sm text-neutral-300">Reviewed</span>
        </label>

        <div className="flex-1 min-w-0">
          <div className="font-mono text-sm truncate">{file.path}</div>
          {file.oldPath ? (
            <div className="font-mono text-[11px] text-neutral-500 truncate">
              renamed from {file.oldPath}
            </div>
          ) : null}
        </div>

        <div className="text-xs tabular-nums text-neutral-500 flex-none">
          <span className="text-green-400">+{file.additions}</span>{" "}
          <span className="text-red-400">−{file.deletions}</span>{" "}
          <span className="uppercase tracking-wide ml-1">{file.status}</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {file.tourNote && (
          <div className="px-5 py-3 bg-emerald-500/5 border-b border-emerald-500/20 text-[13px] text-emerald-200/90 whitespace-pre-wrap leading-relaxed">
            <span className="uppercase tracking-wide text-[10px] text-emerald-400 mr-2">
              Tour
            </span>
            {file.tourNote}
          </div>
        )}
        {file.view === "content" ? (
          <ContentView file={file} highlighter={highlighter} />
        ) : (
          <DiffView file={file} highlighter={highlighter} />
        )}
      </div>

      <div className="border-t border-neutral-800 p-3">
        <label className="text-xs uppercase tracking-wide text-neutral-500">
          Note on this file
        </label>
        <textarea
          value={note}
          onChange={(e) => onNoteChange(file.path, e.target.value)}
          rows={3}
          placeholder="Thoughts about this file… (submitted as part of the review body)"
          className="mt-1 w-full bg-neutral-900 text-sm rounded-md border border-neutral-800 px-2 py-1.5 focus:outline-none focus:border-neutral-600 resize-none font-sans"
        />
      </div>
    </section>
  );
}
