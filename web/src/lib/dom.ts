export function isTypingInField(el: EventTarget | null): boolean {
  const tgt = el as HTMLElement | null;
  return !!(
    tgt &&
    (tgt.tagName === "INPUT" ||
      tgt.tagName === "TEXTAREA" ||
      tgt.isContentEditable)
  );
}
