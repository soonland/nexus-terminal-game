import type { ReactNode } from 'react';
import { useStickyScroll } from './useStickyScroll';

interface Props {
  // Changes when content is added; see useStickyScroll.
  contentKey: string | number;
  // Names the log for assistive technology (and for the player who tabs to it).
  label: string;
  // The scrolling element's class; the wrapper only positions the "new" button over it.
  className?: string;
  children: ReactNode;
}

// A focusable, scrollable log. The keyboard scrolls it natively when it has focus (arrows,
// PageUp/PageDown, Home/End); CommsPane adds PageUp/PageDown for the Sentinel input.
export const StickyScroller = ({ contentKey, label, className, children }: Props) => {
  const { ref, contentRef, onScroll, scrollToBottom, hasNew } = useStickyScroll(contentKey);
  return (
    <div className="sticky-scroll">
      <div
        ref={ref}
        role="log"
        aria-label={label}
        tabIndex={0}
        data-comms-scroll=""
        className={className}
        onScroll={onScroll}>
        <div ref={contentRef}>{children}</div>
      </div>
      {hasNew && (
        <button type="button" className="sticky-scroll-new" onClick={scrollToBottom}>
          ↓ new — jump to latest
        </button>
      )}
    </div>
  );
};
