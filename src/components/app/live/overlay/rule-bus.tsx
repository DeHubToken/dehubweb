/**
 * Fired stream rules, fanned out to whatever on screen plays them.
 *
 * A separate channel from the room-event bus: a fired rule is not a room
 * event a widget counts, it is a finished instruction — these alerts, these
 * sounds, these lines read aloud — already filled in by the server.
 */
import { createContext, useContext, useEffect, useRef } from 'react';
import { RULE_SOUND_FILES, type RuleFired } from '@/lib/live-overlay/rules';
import { isTipTtsEnabled, speakTipMessage } from '@/lib/live/tip-tts';

export type RuleBus = {
  subscribe: (listener: (fired: RuleFired) => void) => () => void;
  publish: (fired: RuleFired) => void;
};

export function createRuleBus(): RuleBus {
  const listeners = new Set<(fired: RuleFired) => void>();
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish: (fired) => listeners.forEach((listener) => listener(fired)),
  };
}

export const RuleBusContext = createContext<RuleBus | null>(null);

/** Hear fired rules inside a component. The handler may be an inline closure. */
export function useRuleFired(onFired: (fired: RuleFired) => void) {
  const bus = useContext(RuleBusContext);
  const handler = useRef(onFired);
  handler.current = onFired;
  useEffect(() => {
    if (!bus) return;
    return bus.subscribe((fired) => handler.current(fired));
  }, [bus]);
}

/**
 * Plays a fired rule's sounds and reads its lines aloud. Mounted once per
 * surface that should be heard: the viewer's player when the overlay is drawn
 * in the app, the OBS page when it is burned into the video (OBS captures the
 * page's audio), and Live Studio for tests. Honours the viewer's own switch
 * for tip readings, which covers rule audio too.
 *
 * `playLive` off plays only tests: a surface that is not where the overlay
 * is being shown must not double the audio viewers already hear.
 */
export function RuleAudio({ playLive }: { playLive: boolean }) {
  useRuleFired((fired) => {
    if (!isTipTtsEnabled() || (!fired.test && !playLive)) return;
    for (const id of fired.sounds) {
      const src = RULE_SOUND_FILES[id];
      if (!src) continue;
      const audio = new Audio(src);
      audio.volume = 0.8;
      void audio.play().catch(() => undefined);
    }
    for (const line of fired.say) speakTipMessage(line);
  });
  return null;
}
