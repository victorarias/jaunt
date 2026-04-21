import { useEffect, useRef } from "react";

type Props = {
  line: number;
  text: string;
  onChange: (text: string) => void;
  onClose: () => void;
  autoFocus?: boolean;
};

export function UserLineComment({
  line,
  text,
  onChange,
  onClose,
  autoFocus,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus && taRef.current) taRef.current.focus();
  }, [autoFocus]);

  return (
    <div className="thread user-thread">
      <div className="thread-head">
        <span className="dot user" />
        <span className="range">your comment · line {line}</span>
        <span className="spacer" />
        <button
          type="button"
          className="user-close"
          onClick={onClose}
          title="Discard comment"
          aria-label="Discard comment"
        >
          ×
        </button>
      </div>
      <div className="thread-reply">
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Comment on this line…"
          rows={text.split("\n").length > 2 ? 4 : 2}
        />
      </div>
    </div>
  );
}
