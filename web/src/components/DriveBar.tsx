type Props = {
  currentStop: number;
  totalStops: number;
  stopLabel: string;
  canMarkReviewed: boolean;
  currentReviewed: boolean;
  reviewedCount: number;
  totalFiles: number;
  reviewSubmitted: boolean;
  hasAnnotations: boolean;
  canPrevAnn: boolean;
  canNextAnn: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPrevAnn: () => void;
  onNextAnn: () => void;
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
  hasAnnotations,
  canPrevAnn,
  canNextAnn,
  onPrev,
  onNext,
  onPrevAnn,
  onNextAnn,
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
        title="Previous step (mark prev file reviewed on forward)"
      >
        ← prev
        <span className="kbd">K</span>
      </button>

      {hasAnnotations && (
        <button
          type="button"
          className="ann-nav"
          onClick={onPrevAnn}
          disabled={!canPrevAnn}
          title="Previous annotation"
        >
          ◂ ann
          <span className="kbd">P</span>
        </button>
      )}

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
          <>
            <span className="review-count">
              {reviewedCount}/{totalFiles}
            </span>
            <span className="kbd">S</span>
          </>
        )}
      </button>

      {hasAnnotations && (
        <button
          type="button"
          className="ann-nav"
          onClick={onNextAnn}
          disabled={!canNextAnn}
          title="Next annotation (marks current file reviewed if crossing files)"
        >
          ann ▸
          <span className="kbd">N</span>
        </button>
      )}

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
