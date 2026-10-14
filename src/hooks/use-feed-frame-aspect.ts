import { useEffect, useReducer, useRef, type RefObject } from 'react';

const displayed = new Map<string, number>();
const subscriptions = new Map<Element, (visible: boolean) => void>();
let observer: IntersectionObserver | undefined;

/** Hold a feed frame once seen; late decoding must not move the next post. */
export function useFeedFrameAspect(key: string, candidate: number, element: RefObject<HTMLElement>, enabled = true): number {
  const valid = Number.isFinite(candidate) && candidate > 0 ? candidate : 1;
  const latest = useRef({ key, candidate: valid });
  latest.current = { key, candidate: valid };
  const frame = useRef({ key, ratio: displayed.get(key) ?? valid, preparing: false });
  if (frame.current.key !== key) frame.current = { key, ratio: displayed.get(key) ?? valid, preparing: false };
  if (frame.current.preparing && !displayed.has(key)) frame.current.ratio = valid;
  const [, update] = useReducer(value => value + 1, 0);

  useEffect(() => {
    if (!enabled) return;
    const node = element.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    observer ??= new IntersectionObserver(entries => {
      for (const entry of entries) subscriptions.get(entry.target)?.(entry.isIntersecting);
    }, { rootMargin: '0px 10000px' });
    const sync = (visible: boolean) => {
      if (latest.current.key !== key) return;
      const next = frame.current;
      if (visible) {
        // Before the first observer delivery, conservatively retain the initial
        // frame. A cached bitmap may decode before visibility is reported.
        if (!displayed.has(key)) {
          displayed.set(key, next.preparing ? latest.current.candidate : next.ratio);
          if (displayed.size > 1000) displayed.delete(displayed.keys().next().value!);
        }
        next.preparing = false;
      } else {
        next.preparing = true;
        if (!displayed.has(key)) next.ratio = latest.current.candidate;
      }
      update();
    };
    subscriptions.set(node, sync);
    observer.observe(node);
    return () => {
      subscriptions.delete(node);
      observer?.unobserve(node);
      if (!subscriptions.size) { observer?.disconnect(); observer = undefined; }
    };
  }, [key, element, enabled]);

  return enabled ? displayed.get(key) ?? frame.current.ratio : valid;
}
