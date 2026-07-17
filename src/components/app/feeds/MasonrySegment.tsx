/**
 * MasonrySegment
 * ==============
 * Measured masonry for the collapsed-mode home feed. Items are packed
 * shortest-column-first using their real rendered heights (ResizeObserver),
 * which keeps column bottoms as even as the content allows. When a
 * full-width carousel follows the segment (padEnd), any residual gap is
 * covered by ad slots sized to the exact hole: adjacent short columns with
 * similar bottoms share a single wide ad spanning them, and slivers too
 * small to hold an ad are left untouched.
 */

import { ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react';
import AdSlotCard from '../cards/AdSlotCard';

// Smallest hole worth filling with an ad (px)
const MIN_AD_PX = 140;
// Ads shorter than this render the compact ad layout
const COMPACT_AD_PX = 240;
// Adjacent column bottoms within this range merge into one spanning ad
const MERGE_TOL_PX = 48;

interface MasonrySegmentProps {
  items: ReactNode[];
  /** Height estimate (px) per item, used until the real height is measured */
  estimates: number[];
  colCount: number;
  gap?: number;
  padEnd?: boolean;
}

export const MasonrySegment = ({
  items,
  estimates,
  colCount,
  gap = 12,
  padEnd = false,
}: MasonrySegmentProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const [width, setWidth] = useState(0);
  const [measured, setMeasured] = useState<Record<number, number>>({});

  // Measure container width and item heights; re-measure on any resize
  // (images loading, content-visibility swaps, viewport changes).
  //
  // Only the initial pass touches offsetHeight/clientWidth (one synchronous
  // layout at mount). After that, heights come from the ResizeObserver
  // entries themselves — the browser hands us post-layout sizes, so a burst
  // of image loads no longer forces a reflow per callback by re-reading
  // every item (DebugBear 7/14: 6.6s of forced reflows attributed here).
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const indexOf = new Map<Element, number>();
    itemRefs.current.forEach((node, i) => node && indexOf.set(node, i));

    const mergeHeights = (pairs: Array<[number, number]>) => {
      if (pairs.length === 0) return;
      setMeasured((prev) => {
        let changed = false;
        const next: Record<number, number> = { ...prev };
        for (const [i, h] of pairs) {
          if (h > 0 && Math.abs((prev[i] ?? 0) - h) > 1) {
            next[i] = h;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    };

    // Initial pass: single synchronous measure at mount.
    const cw = el.clientWidth;
    setWidth((w) => (Math.abs(cw - w) > 1 ? cw : w));
    const initial: Array<[number, number]> = [];
    itemRefs.current.forEach((node, i) => {
      if (node) initial.push([i, node.offsetHeight]);
    });
    mergeHeights(initial);

    const ro = new ResizeObserver((entries) => {
      const pairs: Array<[number, number]> = [];
      for (const entry of entries) {
        if (entry.target === el) {
          // Container has no padding/border, so contentRect.width == clientWidth.
          const w = entry.contentRect.width;
          setWidth((prev) => (Math.abs(w - prev) > 1 ? w : prev));
          continue;
        }
        const i = indexOf.get(entry.target);
        if (i === undefined) continue;
        // Item wrappers are unstyled divs (no padding/border), so border-box
        // and content-box heights coincide; borderBoxSize matches the old
        // offsetHeight semantics where supported.
        const h = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
        pairs.push([i, Math.round(h)]);
      }
      mergeHeights(pairs);
    });
    ro.observe(el);
    itemRefs.current.forEach((node) => node && ro.observe(node));
    return () => ro.disconnect();
  }, [items.length, colCount]);

  const layout = useMemo(() => {
    const colW = width > 0 ? (width - gap * (colCount - 1)) / colCount : 0;
    const colH = new Array(colCount).fill(0);

    const pos = items.map((_, i) => {
      let c = 0;
      for (let k = 1; k < colCount; k++) if (colH[k] < colH[c]) c = k;
      const h = measured[i] ?? estimates[i] ?? 320;
      const p = { x: c * (colW + gap), y: colH[c] };
      colH[c] += h + gap;
      return p;
    });

    // Column bottoms without the trailing gap
    const bottoms = colH.map((h) => (h > 0 ? h - gap : 0));
    const maxH = Math.max(0, ...bottoms);

    // Fallback ads: cover residual holes before the next full-width insert.
    const ads: { x: number; y: number; w: number; h: number }[] = [];
    if (padEnd && width > 0) {
      let c = 0;
      while (c < colCount) {
        if (maxH - bottoms[c] < MIN_AD_PX) {
          c++;
          continue;
        }
        // Extend the run over adjacent short columns with similar bottoms so
        // they share one wide ad instead of stacking boxes side by side.
        let end = c;
        let runMax = bottoms[c];
        let runMin = bottoms[c];
        while (end + 1 < colCount && maxH - bottoms[end + 1] >= MIN_AD_PX) {
          const nMax = Math.max(runMax, bottoms[end + 1]);
          const nMin = Math.min(runMin, bottoms[end + 1]);
          if (nMax - nMin > MERGE_TOL_PX) break;
          runMax = nMax;
          runMin = nMin;
          end++;
        }
        const top = runMax > 0 ? runMax + gap : 0;
        const h = maxH - top;
        if (h >= MIN_AD_PX - gap) {
          ads.push({
            x: c * (colW + gap),
            y: top,
            w: colW * (end - c + 1) + gap * (end - c),
            h,
          });
        }
        c = end + 1;
      }
    }

    return { colW, pos, height: maxH, ads };
  }, [items, estimates, measured, width, colCount, gap, padEnd]);

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{ height: layout.height > 0 ? layout.height : undefined }}
    >
      {items.map((node, i) => (
        <div
          key={i}
          ref={(el) => {
            itemRefs.current[i] = el;
          }}
          className="absolute top-0 left-0"
          style={{
            width: layout.colW > 0
              ? layout.colW
              : `calc((100% - ${gap * (colCount - 1)}px) / ${colCount})`,
            transform: `translate(${layout.pos[i].x}px, ${layout.pos[i].y}px)`,
          }}
        >
          {node}
        </div>
      ))}
      {layout.ads.map((ad, i) => (
        <div
          key={`ad-${i}`}
          className="absolute top-0 left-0"
          style={{
            width: ad.w,
            height: ad.h,
            transform: `translate(${ad.x}px, ${ad.y}px)`,
          }}
        >
          <AdSlotCard variant="fill" compact={ad.h < COMPACT_AD_PX} />
        </div>
      ))}
    </div>
  );
};

export default MasonrySegment;
