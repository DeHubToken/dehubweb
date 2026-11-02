/**
 * Feed caption "Show more".
 *
 * Long captions show three lines and a "Show more" button. Opening it does not
 * pour the whole text into the feed: the caption opens inside a box with a
 * height cap (about 40% of the screen on desktop, 36% on phones) and the rest
 * scrolls inside that box. When the box reaches its end the scroll carries on
 * into the feed, so nobody gets stuck. "Show less" closes it and keeps the post
 * where it was on screen, so the feed never jumps.
 *
 * Used for photo, text and video posts in the feed. Post pages (`stage`) keep
 * their own inline "more".
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation as _useCopy } from 'react-i18next';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

const CLAMP_LINES = 3;
const BOX_MAX_DESKTOP = 'min(40vh, 300px)';
const BOX_MAX_PHONE = 'min(36dvh, 260px)';

/** Blank lines squeezed to one break, so three preview lines carry text. */
export function squeezeBlankLines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]*\n+/g, '\n');
}

interface FeedCaptionExpanderProps {
  /** The full caption. */
  children: ReactNode;
  /** What the closed three lines show (defaults to children). */
  preview?: ReactNode;
  /** Changes when the text changes (translation, edit), to re-measure. */
  textKey?: string;
  className?: string;
  /** Lines shown before "Show more" (3 for captions, more for text posts). */
  lines?: number;
}

export function FeedCaptionExpander({ children, preview, textKey, className, lines = CLAMP_LINES }: FeedCaptionExpanderProps) {
  const { t: _copy } = _useCopy();
  const isPhone = useIsMobile();
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const [fadeTop, setFadeTop] = useState(false);
  const [fadeBottom, setFadeBottom] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const clampRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Does the closed caption run past three lines? ResizeObserver rather than
  // reading scrollHeight on every render keeps the feed free of forced layout.
  useEffect(() => {
    if (open) return;
    const el = clampRef.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 2);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, textKey]);

  // A new text (translation) closes the box again.
  useEffect(() => { setOpen(false); }, [textKey]);

  const updateFades = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    setFadeTop(el.scrollTop > 4);
    setFadeBottom(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }, []);
  useLayoutEffect(() => { if (open) updateFades(); }, [open, updateFades]);

  const close = (event: React.MouseEvent) => {
    event.stopPropagation();
    const before = rootRef.current?.getBoundingClientRect().top ?? 0;
    setOpen(false);
    // The post's top scrolled above the screen: keep it in the same place, so
    // closing never throws the reader further down the feed.
    if (before < 0) {
      requestAnimationFrame(() => {
        const after = rootRef.current?.getBoundingClientRect().top ?? 0;
        if (after !== before) window.scrollBy(0, after - before);
      });
    }
  };

  const mask = `linear-gradient(to bottom, ${fadeTop ? 'transparent 0, #000 24px' : '#000 0'}, ${fadeBottom ? '#000 calc(100% - 32px), transparent 100%' : '#000 100%'})`;
  const showMoreLabel = _copy('copy.d7cb0dc5c172', { defaultValue: 'Show more ' }).trim();
  const showLessLabel = _copy('copy.c0aab98fd372', { defaultValue: 'Show less ' }).trim();

  if (open) {
    return (
      <div ref={rootRef} className={className} data-caption-open>
        <div
          ref={boxRef}
          onScroll={updateFades}
          data-caption-scroll
          className="overflow-y-auto pr-2 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.25)_transparent]"
          style={{ maxHeight: isPhone ? BOX_MAX_PHONE : BOX_MAX_DESKTOP, WebkitMaskImage: mask, maskImage: mask }}
        >
          {children}
        </div>
        <button
          type="button"
          onClick={close}
          className="mt-1.5 inline-flex items-center gap-0.5 text-[13px] font-semibold text-zinc-300 hover:text-white transition-colors"
        >
          {showLessLabel} <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={className}>
      <div
        ref={clampRef}
        className="overflow-hidden"
        style={{ display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical' }}
      >
        {preview ?? children}
      </div>
      {overflows && (
        <button
          type="button"
          data-caption-more
          onClick={(event) => { event.stopPropagation(); setOpen(true); }}
          className="mt-1 inline-flex items-center gap-0.5 text-[13px] font-semibold text-zinc-300 hover:text-white transition-colors"
        >
          {showMoreLabel} <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
