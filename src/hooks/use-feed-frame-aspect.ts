import { useEffect, useReducer, useRef, type RefObject } from 'react';
import { isFeedScrolling, subscribeFeedScrollSettled } from '@/lib/feed-scroll-activity';

const displayed = new Map<string, number>();
const subscriptions = new Map<Element, Set<(visible: boolean) => void>>();
let observer: IntersectionObserver | undefined;

/** Hold a feed frame once seen; late decoding must not move the next post. */
export function useFeedFrameAspect(key: string, candidate: number, element: RefObject<HTMLElement>, enabled = true, measured?: number | null): number {
  const valid = Number.isFinite(candidate) && candidate > 0 ? candidate : 1;
  const latest = useRef({ key, candidate: valid });
  latest.current = { key, candidate: valid };
  const frame = useRef({ key, ratio: displayed.get(key) ?? valid, preparing: false });
  if (frame.current.key !== key) frame.current = { key, ratio: displayed.get(key) ?? valid, preparing: false };
  // Video metadata and decoded posters can correct an initial fallback frame.
  // Image galleries omit this value and retain their reserved scroll geometry.
  if (enabled && measured != null && Number.isFinite(measured) && measured > 0 && !isFeedScrolling()) {
    frame.current.ratio = measured;
    displayed.set(key, measured);
    if (displayed.size > 1000) displayed.delete(displayed.keys().next().value!);
  }
  if (frame.current.preparing && !displayed.has(key)) frame.current.ratio = valid;
  const [, update] = useReducer(value => value + 1, 0);
  const pendingMeasurement = useRef(measured);
  pendingMeasurement.current = measured;
  useEffect(() => {
    if (!enabled) return;
    return subscribeFeedScrollSettled(() => {
      const ratio = pendingMeasurement.current;
      if (ratio != null && Number.isFinite(ratio) && ratio > 0 && displayed.get(key) !== ratio) update();
    });
  }, [key, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const node = element.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    observer ??= new IntersectionObserver(entries => {
      for (const entry of entries) subscriptions.get(entry.target)?.forEach(sync => sync(entry.isIntersecting));
    // Freeze before the screen edge: observer delivery follows layout, so a
    // zero-margin boundary lets late metadata resize a just-entering card.
    }, { rootMargin: '600px 0px' });
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
    let listeners = subscriptions.get(node);
    if (!listeners) {
      listeners = new Set();
      subscriptions.set(node, listeners);
      observer.observe(node);
    }
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
      if (!listeners.size) {
        subscriptions.delete(node);
        observer?.unobserve(node);
      }
      if (!subscriptions.size) { observer?.disconnect(); observer = undefined; }
    };
  }, [key, element, enabled]);

  return enabled ? displayed.get(key) ?? frame.current.ratio : valid;
}
