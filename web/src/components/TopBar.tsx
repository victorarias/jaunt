import type { PRMeta } from "../types.ts";
import type { SaveStatus } from "../hooks/useDraft.ts";

type Props = {
  meta: PRMeta;
  reviewedCount: number;
  totalCount: number;
  saveStatus: SaveStatus;
};

export function TopBar({ meta, reviewedCount, totalCount, saveStatus }: Props) {
  return (
    <header className="topbar">
      <span className="prompt">$</span>
      <span className="repo">
        <a href={meta.url} target="_blank" rel="noreferrer">
          {meta.ref.owner}/{meta.ref.repo}
        </a>
      </span>
      <span style={{ color: "var(--fg-dimmer)" }}>pr/#{meta.ref.number}</span>
      <span className="title" title={meta.title}>
        {meta.title}
      </span>
      <span className="spacer" />
      <span className="pill agent">● {meta.author}</span>
      <span className="pill">
        {meta.headRef} → {meta.baseRef}
      </span>
      <span className="pill">
        {reviewedCount}/{totalCount} reviewed
      </span>
      <SaveIndicator status={saveStatus} />
    </header>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  const label =
    status === "saving"
      ? "saving…"
      : status === "saved"
        ? "saved"
        : "save failed";
  return <span className={`pill save-${status}`}>{label}</span>;
}
