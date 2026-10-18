import { useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { NewPostAuthor } from '@/hooks/use-unified-feed';

const SHOULDER = 8;
const HEIGHT = 28;
const CORNER = 12;
const FACE = 18;
const FACE_OVERLAP = 6;

/** The bead's outline: concave shoulders off the bar's bottom edge, then a
 *  rounded tab. `open` leaves the top unstroked so it joins the bar's rim. */
function beadPath(width: number, square: boolean, open = false) {
  const f = square ? 0 : SHOULDER;
  const r = square ? 0 : CORNER;
  const tab = width - f * 2;
  const top = open ? 0.5 : 0;
  const bottom = open ? HEIGHT - 0.5 : HEIGHT;
  return `M0,${top}Q${f},${top} ${f},${f}V${HEIGHT - r}A${r},${r} 0 0 0 ${f + r},${bottom}H${f + tab - r}A${r},${r} 0 0 0 ${f + tab},${HEIGHT - r}V${f}Q${f + tab},${top} ${width},${top}${open ? '' : 'Z'}`;
}

/** "+N" with up to three faces, hanging off the bottom of the phone nav bar
 *  as part of it. Tapping it loads the new posts. */
export function NewPostsBead({ count, authors, square, onShow }: {
  count: number;
  authors: NewPostAuthor[];
  /** Minimal: square corners, no curves. */
  square: boolean;
  onShow: () => void;
}) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const faces = authors.slice(0, 3);
  // The head poll fetches 20 rows, so a full page means "20 or more".
  const label = `+${count}`;
  const f = square ? 0 : SHOULDER;
  // Size the tab to its contents, then draw the outline around it.
  const contentRef = useRef<HTMLSpanElement>(null);
  const [contentWidth, setContentWidth] = useState(56);
  useLayoutEffect(() => {
    const node = contentRef.current;
    if (node) setContentWidth(Math.ceil(node.offsetWidth));
  }, [label, faces.length]);
  const width = f * 2 + contentWidth + 18;

  return (
    <motion.div
      data-feed-new-posts-bead-root
      initial={{ scaleY: 0, opacity: 0 }}
      animate={{ scaleY: 1, opacity: 1 }}
      exit={{ scaleY: 0, opacity: 0, pointerEvents: 'none' }}
      transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 32, mass: 0.7 }}
      className="pointer-events-none relative -mt-px origin-top"
      style={{ width, height: HEIGHT + 1 }}
    >
      <span
        data-feed-new-posts-bead
        aria-hidden="true"
        className="absolute inset-0"
        style={{ clipPath: `path('${beadPath(width, square)}')` }}
      />
      <svg data-feed-new-posts-bead-rim aria-hidden="true" width={width} height={HEIGHT + 1} className="absolute inset-0 overflow-visible">
        <path d={beadPath(width, square, true)} fill="none" strokeWidth={1} style={{ stroke: 'var(--bead-rim)' }} />
      </svg>
      <button
        type="button"
        onClick={onShow}
        aria-label={t('feed.newPosts', { defaultValue: '{{count}} new posts', count })}
        className="pointer-events-auto absolute top-0 flex items-center justify-center text-xs font-bold tabular-nums"
        style={{ left: f, width: width - f * 2, height: HEIGHT, color: 'var(--bead-ink)' }}
      >
        <span ref={contentRef} className="flex items-center gap-[5px]">
        {faces.length > 0 && (
          <span className="flex">
            {faces.map((author, i) => (
              <span
                key={author.address}
                data-feed-new-posts-face
                className="block shrink-0 overflow-hidden rounded-[6px] bg-white/20"
                style={{ width: FACE, height: FACE, marginLeft: i ? -FACE_OVERLAP : 0, zIndex: 3 - i, boxShadow: '0 0 0 1.5px var(--bead-face-ring)' }}
              >
                {author.avatarUrl
                  ? <img src={author.avatarUrl} alt="" width={FACE} height={FACE} className="h-full w-full object-cover" />
                  : <span className="flex h-full w-full items-center justify-center text-[9px] font-bold uppercase">{author.name.slice(0, 1)}</span>}
              </span>
            ))}
          </span>
        )}
        <span>{label}</span>
        </span>
      </button>
    </motion.div>
  );
}
