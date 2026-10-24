import { useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { NewPostAuthor } from '@/hooks/use-unified-feed';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

const SHOULDER = 10;
const HEIGHT = 34;
const CORNER = 14;
const FACE = 22;
const FACE_OVERLAP = 7;

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
export function NewPostsBead({ count, authors, square, host, onShow }: {
  count: number;
  authors: NewPostAuthor[];
  /** Minimal: square corners, no curves. */
  square: boolean;
  /** The bar it hangs from. Its rim is opened where the bead joins, so the
   *  bar's outline runs straight into the bead's. */
  host: HTMLElement | null;
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
  const [contentWidth, setContentWidth] = useState(72);
  useLayoutEffect(() => {
    const node = contentRef.current;
    if (node) setContentWidth(Math.ceil(node.offsetWidth));
  }, [label, faces.length]);
  const width = f * 2 + contentWidth + 24;
  useLayoutEffect(() => {
    if (!host) return;
    host.setAttribute('data-new-posts-open', '');
    host.style.setProperty('--bead-gap', `${width}px`);
    return () => {
      host.removeAttribute('data-new-posts-open');
      host.style.removeProperty('--bead-gap');
    };
  }, [host, width]);

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
        className="pointer-events-auto absolute top-0 flex items-center justify-center text-sm font-bold tabular-nums"
        style={{ left: f, width: width - f * 2, height: HEIGHT, color: 'var(--bead-ink)' }}
      >
        <span ref={contentRef} className="flex items-center gap-[6px]">
        {faces.length > 0 && (
          <span className="flex">
            {faces.map((author, i) => (
              <Avatar
                key={author.address}
                data-feed-new-posts-face
                className="block shrink-0 overflow-hidden rounded-[7px]"
                style={{ width: FACE, height: FACE, marginLeft: i ? -FACE_OVERLAP : 0, zIndex: 3 - i, boxShadow: '0 0 0 1.5px var(--bead-face-ring)' }}
              >
                <AvatarImage src={author.avatarUrl} alt="" className="h-full w-full object-cover" />
                <AvatarFallback className="rounded-[7px] text-[10px] font-bold uppercase">{author.name.slice(0, 1)}</AvatarFallback>
              </Avatar>
            ))}
          </span>
        )}
        <span>{label}</span>
        </span>
      </button>
    </motion.div>
  );
}
