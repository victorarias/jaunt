type Props = {
  currentStop: number;
  totalStops: number;
  stopLabel: string;
  canMarkReviewed: boolean;
  currentReviewed: boolean;
  reviewedCount: number;
  totalFiles: number;
  reviewSubmitted: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToggleReviewed: () => void;
  onOpenSubmit: () => void;
};

export function DriveBar({
  currentStop,
  totalStops,
  stopLabel,
  canMarkReviewed,
  currentReviewed,
  reviewedCount,
  totalFiles,
  reviewSubmitted,
  onPrev,
  onNext,
  onToggleReviewed,
  onOpenSubmit,
}: Props) {
  const lastStop = totalStops - 1;
  const allReviewed = totalFiles > 0 && reviewedCount === totalFiles;
  const nextLabel = currentStop === 0 ? "Start tour" : "Next step";

  return (
    <footer className="drive">
      <button
        type="button"
        className="prev"
        onClick={onPrev}
        disabled={currentStop === 0}
      >
        ← prev
        <span className="kbd">K</span>
      </button>

      <div className="stop-info">
        <b>{String(currentStop).padStart(2, "0")}</b>
        <span className="of">/ {String(lastStop).padStart(2, "0")}</span>
        <span className="label" title={stopLabel}>
          {stopLabel}
        </span>
      </div>

      <span className="spacer" />

      {canMarkReviewed && (
        <button
          type="button"
          className={`btn sm ${currentReviewed ? "reviewed" : ""}`}
          onClick={onToggleReviewed}
        >
          {currentReviewed ? "✓ reviewed" : "mark reviewed"}
          <span className="kbd">R</span>
        </button>
      )}

      <button
        type="button"
        className={`submit-review ${allReviewed ? "ready" : ""}`}
        onClick={onOpenSubmit}
        disabled={totalFiles === 0}
        title={
          allReviewed
            ? "All files reviewed — ready to submit"
            : `${reviewedCount}/${totalFiles} files reviewed`
        }
      >
        {reviewSubmitted ? "✓ review submitted" : "Submit review"}
        {!reviewSubmitted && (
          <span className="review-count">
            {reviewedCount}/{totalFiles}
          </span>
        )}
      </button>

      <button
        type="button"
        className="next"
        onClick={onNext}
        disabled={currentStop >= lastStop}
      >
        {nextLabel} →<span className="kbd">J</span>
      </button>
    </footer>
  );
}
