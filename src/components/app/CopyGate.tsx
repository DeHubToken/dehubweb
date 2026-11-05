import { useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { takePendingCopy } from '@/i18n';

/** Longest a fresh page waits behind its skeleton for its text. */
export const COPY_HOLD_CAP_MS = 1500;

/**
 * Holds a freshly mounted page behind its skeleton until the copy it asked
 * for has loaded, so it appears once with its real words instead of first
 * rendering stand-ins ("Bdm Title", "Hero Title") and reflowing a second
 * later. The page still renders and fetches underneath, invisibly; only the
 * first mount is ever held, and never for longer than the cap.
 *
 * The wrapper div is always there, so letting go never remounts the page.
 */
export function CopyGate({ skeleton: Skeleton, children }: { skeleton: ComponentType; children: ReactNode }) {
  const [hold, setHold] = useState(false);
  const checked = useRef(false);

  // Layout effect: runs after the page's first render asked for its packs and
  // before the browser paints it, so the stand-in text is never seen.
  useLayoutEffect(() => {
    if (checked.current) return;
    checked.current = true;
    const wait = takePendingCopy();
    if (!wait) return;
    setHold(true);
    let alive = true;
    const release = () => { if (alive) setHold(false); };
    const cap = window.setTimeout(release, COPY_HOLD_CAP_MS);
    // The words that land can render parts that ask for more words, so look
    // again one frame after each batch lands and only let go once nothing is
    // left waiting (or the cap passes).
    const settle = (pending: Promise<unknown>) => {
      void pending.finally(() => requestAnimationFrame(() => {
        if (!alive) return;
        const more = takePendingCopy();
        if (more) settle(more); else release();
      }));
    };
    settle(wait);
    return () => { alive = false; window.clearTimeout(cap); };
  }, []);

  return (
    <div data-copy-gate={hold ? 'hold' : undefined} style={hold ? { position: 'relative' } : undefined}>
      <div style={hold ? { visibility: 'hidden' } : undefined} aria-hidden={hold || undefined}>
        {children}
      </div>
      {hold && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          <Skeleton />
        </div>
      )}
    </div>
  );
}
