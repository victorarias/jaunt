import { useCallback, useState } from "react";

/**
 * Tracks which line numbers have an open comment form. Closing a line also
 * clears any saved text via the caller's onSetLineComment — shared between
 * DiffView and ContentView so "× on a draft" means the same thing in both.
 */
export function useLineCommentForm(
  onSetLineComment: (line: number, text: string) => void,
) {
  const [openLines, setOpenLines] = useState<Set<number>>(new Set());

  const openLine = useCallback((n: number) => {
    setOpenLines((s) => {
      if (s.has(n)) return s;
      const next = new Set(s);
      next.add(n);
      return next;
    });
  }, []);

  const closeLine = useCallback(
    (n: number) => {
      setOpenLines((s) => {
        if (!s.has(n)) return s;
        const next = new Set(s);
        next.delete(n);
        return next;
      });
      onSetLineComment(n, "");
    },
    [onSetLineComment],
  );

  return { openLines, openLine, closeLine };
}
