import type { PRMeta } from "../types.ts";
import type { SaveStatus } from "../hooks/useDraft.ts";

type Props = {
  meta: PRMeta;
  reviewedCount: number;
  totalCount: number;
  saveStatus: SaveStatus;
  submitting: boolean;
  onSubmit: () => void;
};

export function TopBar({
  meta,
  reviewedCount,
  totalCount,
  saveStatus,
  submitting,
  onSubmit,
}: Props) {
  return (
    <header className="border-b border-neutral-800 px-6 py-3 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-xs text-neutral-500 flex items-center gap-2">
          <a
            href={meta.url}
            target="_blank"
            rel="noreferrer"
            className="hover:text-neutral-300 transition-colors"
          >
            {meta.ref.owner}/{meta.ref.repo}#{meta.ref.number}
          </a>
          <span>·</span>
          <span>{meta.author}</span>
          <span>·</span>
          <span>
            {meta.headRef} → {meta.baseRef}
          </span>
        </div>
        <h1 className="text-base font-medium mt-0.5 truncate">{meta.title}</h1>
      </div>

      <div className="text-xs text-neutral-400 tabular-nums">
        {reviewedCount} / {totalCount} reviewed
      </div>

      <SaveIndicator status={saveStatus} />

      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting || totalCount === 0}
        className="px-3 py-1.5 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:bg-neutral-700 disabled:text-neutral-500 transition-colors"
      >
        {submitting ? "Submitting…" : "Push review to GitHub"}
      </button>
    </header>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const text =
    status === "saving"
      ? "saving…"
      : status === "saved"
        ? "draft saved"
        : status === "error"
          ? "save failed"
          : "";
  const color =
    status === "error"
      ? "text-red-400"
      : status === "saving"
        ? "text-neutral-500"
        : status === "saved"
          ? "text-emerald-500"
          : "text-transparent";
  return (
    <span className={`text-xs ${color} w-20 text-right tabular-nums`}>
      {text || " "}
    </span>
  );
}
