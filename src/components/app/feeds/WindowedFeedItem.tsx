import { useEffect, useRef, useState, type HTMLAttributes } from 'react';
import { useDislikeVanish } from '@/hooks/use-dislike-vanish';

type Subscription = { intersect: (entry: IntersectionObserverEntry) => void; resize: (entry: ResizeObserverEntry) => void };
const subscriptions = new Map<Element, Subscription>();
let visibility: IntersectionObserver | undefined;
let sizes: ResizeObserver | undefined;

function observe(element: HTMLElement, subscription: Subscription) {
  visibility ??= new IntersectionObserver(entries => {
    for (const entry of entries) subscriptions.get(entry.target)?.intersect(entry);
  }, { rootMargin: '1600px 0px' });
  sizes ??= new ResizeObserver(entries => {
    for (const entry of entries) subscriptions.get(entry.target)?.resize(entry);
  });
  subscriptions.set(element, subscription);
  visibility.observe(element);
  sizes.observe(element);
  return () => {
    visibility?.unobserve(element);
    sizes?.unobserve(element);
    subscriptions.delete(element);
    if (!subscriptions.size) {
      visibility?.disconnect(); sizes?.disconnect();
      visibility = undefined; sizes = undefined;
    }
  };
}

/** Keep the scroll runway, but release distant cards' media, effects and DOM. */
export function WindowedFeedItem({ children, estimatedHeight, eager = false, style, vanishOnDislike, ...props }:
  HTMLAttributes<HTMLDivElement> & {
    estimatedHeight: number; eager?: boolean;
    /** The post in this slot. The slot folds away when the viewer dislikes it. */
    vanishOnDislike?: string | number | null;
  }) {
  const supported = typeof IntersectionObserver !== 'undefined' && typeof ResizeObserver !== 'undefined';
  const [mounted, setMounted] = useState(eager || !supported);
  const root = useRef<HTMLDivElement>(null);
  const height = useRef(estimatedHeight);
  const mountedRef = useRef(mounted);
  mountedRef.current = mounted;

  useEffect(() => {
    if (!supported || !root.current) return;
    const element = root.current;
    return observe(element, {
      resize(entry) {
        // Observer measurements do not force synchronous layout during a swipe.
        const box = entry.borderBoxSize?.[0];
        if (mountedRef.current && box && box.blockSize > 0) height.current = box.blockSize;
      },
      intersect(entry) {
        if (entry.isIntersecting) { setMounted(true); return; }
        // Hidden cached tabs and an open dialog must retain their current state.
        if (!entry.boundingClientRect.height || element.contains(document.activeElement)
          || document.querySelector('[role="dialog"][data-state="open"], [aria-modal="true"]')) return;
        if (mountedRef.current) height.current = entry.boundingClientRect.height;
        setMounted(false);
      },
    });
  }, [supported]);

  const vanished = useDislikeVanish(vanishOnDislike, root);
  if (vanished) return null;

  return <div {...props} ref={root} data-feed-mounted={mounted ? 'true' : 'false'}
    style={mounted ? style : { ...style, height: height.current, boxSizing: 'border-box', overflow: 'hidden' }}>
    {mounted ? children : null}
  </div>;
}
