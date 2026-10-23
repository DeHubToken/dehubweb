import { createContext, useContext, useEffect, useRef } from 'react';
import type { LiveRoomEvent } from '@/lib/api/dehub/stream-presence';

/**
 * One subscription to the stream's room for the whole overlay, fanned out to
 * every widget. Ten widgets each joining the room would mean ten handlers per
 * event on the shared socket and ten chances to miss a rejoin.
 */
export type OverlayEventBus = {
  subscribe: (listener: (event: LiveRoomEvent) => void) => () => void;
};

export function createOverlayEventBus(): OverlayEventBus & { publish: (event: LiveRoomEvent) => void } {
  const listeners = new Set<(event: LiveRoomEvent) => void>();
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish: (event) => listeners.forEach((listener) => listener(event)),
  };
}

export const OverlayEventContext = createContext<OverlayEventBus | null>(null);

/** Hear the stream's events inside a widget. The handler may be an inline closure. */
export function useOverlayEvent(onEvent: (event: LiveRoomEvent) => void) {
  const bus = useContext(OverlayEventContext);
  const handler = useRef(onEvent);
  handler.current = onEvent;
  useEffect(() => {
    if (!bus) return;
    return bus.subscribe((event) => handler.current(event));
  }, [bus]);
}
