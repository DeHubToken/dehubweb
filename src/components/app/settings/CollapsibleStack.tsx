import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/**
 * A vertical stack that shows only its first child and lets the rest fade out
 * into nothing until the user expands it.
 *
 * The fade is a real alpha `mask-image`, not a gradient panel painted over the
 * content. A gradient would have to guess the page background, and DeHub's
 * themes range from near-black to near-white glass — the same overlay that
 * disappears on one theme is an obvious grey smear on another. Masking fades
 * the pixels themselves, so it is correct on every theme by construction.
 */
export function CollapsibleStack({
  children,
  peek = 72,
  className,
}: {
  children: React.ReactNode;
  /** How far past the first child the fade runs before it hits full transparency. */
  peek?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [firstHeight, setFirstHeight] = useState(0);
  const [fullHeight, setFullHeight] = useState(0);
  const innerRef = useRef<HTMLDivElement>(null);

  const measure = useCallback(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const first = inner.firstElementChild as HTMLElement | null;
    setFirstHeight(first?.offsetHeight ?? 0);
    setFullHeight(inner.scrollHeight);
  }, []);

  useLayoutEffect(measure, [measure, children]);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner || typeof ResizeObserver === 'undefined') return;
    // Rows grow as the user types, and the profiles/ENS rows load in late, so
    // a one-shot measurement would leave the clip at a stale height.
    const ro = new ResizeObserver(measure);
    ro.observe(inner);
    const first = inner.firstElementChild;
    if (first) ro.observe(first);
    return () => ro.disconnect();
  }, [measure]);

  // Collapsed height stays at the first child plus the fade run-out, so there
  // is always something visibly dissolving rather than a hard cut.
  const collapsedHeight = firstHeight ? firstHeight + peek : peek;
  const fadeStart = Math.max(firstHeight, 0);
  const fade = `linear-gradient(to bottom, #000 0px, #000 ${fadeStart}px, transparent ${fadeStart + peek}px)`;

  return (
    <div className={className}>
      {/* Tabbing into a masked-out field would put the caret somewhere the user
          cannot see, so keyboard focus opens the stack instead. */}
      <div
        className="overflow-hidden transition-[max-height] duration-300 ease-out"
        style={{
          maxHeight: expanded ? (fullHeight ? `${fullHeight}px` : 'none') : `${collapsedHeight}px`,
          maskImage: expanded ? undefined : fade,
          WebkitMaskImage: expanded ? undefined : fade,
        }}
        onFocusCapture={() => setExpanded(true)}
      >
        <div ref={innerRef} className="space-y-5">
          {children}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 flex items-center justify-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
        aria-expanded={expanded}
      >
        {expanded ? t('settings.showLess', 'Show less') : t('settings.showAll', 'Show all')}
        <ChevronDown className={cn('w-4 h-4 transition-transform duration-300', expanded && 'rotate-180')} />
      </button>
    </div>
  );
}
