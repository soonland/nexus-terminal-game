import { useCallback, useEffect, useRef, useState } from 'react';

// How close to the bottom still counts as "at the bottom" (a partly visible last line, a
// fractional scroll position).
const NEAR_BOTTOM_PX = 24;

// A scrolling log that follows new content only while the reader is at the bottom. Scrolled up,
// it stays put and `hasNew` says something arrived below. `contentKey` must change whenever
// content is added (the newest line's id, a message count) and must NOT change on a re-render
// that adds nothing, or the reader would be pulled down again.
export const useStickyScroll = (contentKey: string | number) => {
  const ref = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [hasNew, setHasNew] = useState(false);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
    if (atBottom.current) setHasNew(false);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
    atBottom.current = true;
    setHasNew(false);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (atBottom.current) el.scrollTop = el.scrollHeight;
    else setHasNew(true);
  }, [contentKey]);

  // Layout can settle after the first scroll (a webfont, a wrapped line, a resized pane): while
  // the reader is at the bottom, stay there. Both the window and the content can change size.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (atBottom.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    if (contentRef.current) observer.observe(contentRef.current);
    return () => {
      observer.disconnect();
    };
  }, []);

  return { ref, contentRef, onScroll, scrollToBottom, hasNew };
};
