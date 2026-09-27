/**
 * On-device dub playback: speaks translated transcript lines with the
 * browser's speech synthesiser in step with a <video>. Only reached through
 * the lazily loaded VoiceDubEngine, so it costs nothing until a dub plays.
 * The switch and voice picking are in dub-preference.ts.
 */
import { useEffect } from 'react';
import type { TranscriptSegment } from '@/hooks/use-transcript';
import { synth } from '@/hooks/dub-preference';

/** Original audio sits under the voice at this volume while a dub plays. */
const DUCK_VOLUME = 0.15;
/** Characters per second a voice reads comfortably at rate 1. */
const NATURAL_CPS = 14;
const MAX_RATE = 1.3;

/* ──────────────────────────────── engine ────────────────────────────────── */

// The synthesiser is one per page, but several cards can mount an engine.
// Only the one that spoke last may cancel, so a card scrolling away does not
// silence the one being watched.
let speaker: object | null = null;

// One engine per <video>. A post opened over the feed shares the feed card's
// element, and two engines on it double every line and duck twice.
const owners = new WeakMap<HTMLVideoElement, object>();

/**
 * Speak `segments` in `voice`, in step with the video. Pass null segments or
 * voice to stop. Each line starts when playback crosses its start; a line
 * still running when the next begins is cut off rather than queued, so the
 * voice can never drift behind the picture. `onFailed` fires when the
 * browser refuses to speak (iOS Safari without a prior gesture, a dead voice),
 * after the original audio has been put back.
 */
export function useVoiceDub(
  videoRef: React.RefObject<HTMLVideoElement>,
  segments: TranscriptSegment[] | null,
  voice: SpeechSynthesisVoice | null,
  onFailed?: () => void,
) {
  useEffect(() => {
    const v = videoRef.current;
    const s = synth();
    if (!v || !s || !voice || !segments?.length) return;
    if (owners.has(v)) return;

    const me = {};
    owners.set(v, me);
    let spoken = -1;
    let failed = false;

    // The viewer's level. The element holds a fraction of it while dubbing,
    // and a change we did not make is the viewer moving the slider.
    let userVolume = v.volume;
    let settingVolume = false;
    const setVolume = (x: number) => {
      if (Math.abs(v.volume - x) < 0.001) return;
      settingVolume = true;
      v.volume = x;
    };
    const duck = () => setVolume(userVolume * DUCK_VOLUME);
    duck();

    const stop = () => {
      spoken = -1;
      if (speaker === me) s.cancel();
    };

    const indexAt = (t: number) => {
      for (let i = segments.length - 1; i >= 0; i--) {
        if (segments[i].start <= t) return t < segments[i].end ? i : -1;
      }
      return -1;
    };

    const fail = () => {
      if (failed) return;
      failed = true;
      stop();
      setVolume(userVolume);
      onFailed?.();
    };

    const speak = (i: number) => {
      const seg = segments[i];
      spoken = i;
      s.cancel();
      speaker = me;
      if (!seg.text.trim()) return;
      const u = new SpeechSynthesisUtterance(seg.text);
      u.voice = voice;
      u.lang = voice.lang;
      const duration = Math.max(0.5, seg.end - seg.start);
      const needed = seg.text.length / duration / NATURAL_CPS;
      u.rate = Math.min(MAX_RATE, Math.max(1, needed)) * (v.playbackRate || 1);
      u.volume = userVolume;
      // Cutting a line off for the next one reports 'interrupted'/'canceled';
      // anything else means this browser will not speak for us.
      u.onerror = (e) => {
        if (e.error !== 'interrupted' && e.error !== 'canceled') fail();
      };
      s.speak(u);
    };

    const tick = () => {
      if (failed || v.paused || v.muted || v.seeking) return;
      const i = indexAt(v.currentTime);
      if (i >= 0 && i !== spoken) speak(i);
    };

    const onVolume = () => {
      if (v.muted) stop();
      if (settingVolume) {
        settingVolume = false;
        return;
      }
      userVolume = v.volume;
      if (!failed) duck();
    };

    v.addEventListener('pause', stop);
    v.addEventListener('seeking', stop);
    v.addEventListener('play', tick);
    v.addEventListener('seeked', tick);
    v.addEventListener('volumechange', onVolume);
    const timer = window.setInterval(tick, 100);
    tick();

    return () => {
      window.clearInterval(timer);
      v.removeEventListener('pause', stop);
      v.removeEventListener('seeking', stop);
      v.removeEventListener('play', tick);
      v.removeEventListener('seeked', tick);
      v.removeEventListener('volumechange', onVolume);
      if (speaker === me) {
        s.cancel();
        speaker = null;
      }
      if (owners.get(v) === me) owners.delete(v);
      setVolume(userVolume);
    };
    // onFailed is a notification, not an input: a new callback identity must
    // not restart the engine mid-line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef, segments, voice]);
}
