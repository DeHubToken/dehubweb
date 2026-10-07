/**
 * On-device dub playback: speaks translated transcript lines with the
 * browser's speech synthesiser in step with a <video>. Only reached through
 * the lazily loaded VoiceDubEngine, so it costs nothing until a dub plays.
 * The switch and voice picking are in dub-preference.ts.
 */
import { useEffect } from 'react';
import type { TranscriptSegment } from '@/hooks/use-transcript';
import { synth } from '@/hooks/dub-preference';

/** Boost the dub above the viewer's level without changing the original track. */
const DUB_VOLUME_BOOST = 1.5;
/** Characters per second a voice reads comfortably at rate 1. */
const NATURAL_CPS = 14;
const MAX_RATE = 1.3;

/* ──────────────────────────────── engine ────────────────────────────────── */

// The synthesiser is one per page, but several cards can mount an engine.
// Only the one that spoke last may cancel, so a card scrolling away does not
// silence the one being watched.
let speaker: object | null = null;

// One engine per <video>. A post opened over the feed shares the feed card's
// element, and two engines on it double every line.
const owners = new WeakMap<HTMLVideoElement, object>();

/**
 * Speak `segments` in `voice`, in step with the video. Pass null segments or
 * voice to stop. Each line starts when playback crosses its start; a line
 * still running when the next begins is cut off rather than queued, so the
 * voice can never drift behind the picture. `onFailed` fires when the
 * browser refuses to speak (iOS Safari without a prior gesture, a dead voice),
 * while the original audio keeps playing at the viewer's level.
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
    let utterance: SpeechSynthesisUtterance | null = null;

    const stop = () => {
      spoken = -1;
      utterance = null;
      if (speaker === me) { s.cancel(); speaker = null; }
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
      onFailed?.();
    };

    const speak = (i: number) => {
      const seg = segments[i];
      if (seg.end - v.currentTime < 0.8) return;
      utterance = null;
      spoken = i;
      s.cancel();
      speaker = me;
      if (!seg.text.trim()) return;
      const u = new SpeechSynthesisUtterance(seg.text);
      utterance = u;
      u.voice = voice;
      u.lang = voice.lang;
      const duration = Math.max(0.5, seg.end - v.currentTime);
      const needed = seg.text.length / duration / NATURAL_CPS;
      u.rate = Math.min(MAX_RATE, Math.max(1, needed * (v.playbackRate || 1)));
      u.volume = Math.min(1, v.volume * DUB_VOLUME_BOOST);
      u.onstart = () => {
        if (utterance !== u) return;
        if (v.paused || v.muted || v.volume === 0) { stop(); return; }
      };
      const finish = () => {
        if (utterance !== u) return;
        utterance = null;
        if (speaker === me) speaker = null;
      };
      u.onend = finish;
      // Cutting a line off for the next one reports 'interrupted'/'canceled';
      // anything else means this browser will not speak for us.
      u.onerror = (e) => {
        if (utterance !== u) return;
        if (e.error !== 'interrupted' && e.error !== 'canceled') fail();
        else finish();
      };
      try { s.speak(u); } catch { fail(); }
    };

    const tick = () => {
      if (failed || v.paused || v.muted || v.seeking || v.volume === 0) return;
      const i = indexAt(v.currentTime);
      if (i < 0 && utterance) { stop(); return; }
      if (i >= 0 && i !== spoken) speak(i);
    };

    const onVolume = () => {
      if (v.muted || v.volume === 0) stop();
      else if (utterance) utterance.volume = Math.min(1, v.volume * DUB_VOLUME_BOOST);
    };

    v.addEventListener('pause', stop);
    v.addEventListener('seeking', stop);
    v.addEventListener('ended', stop);
    v.addEventListener('play', tick);
    v.addEventListener('seeked', tick);
    v.addEventListener('volumechange', onVolume);
    const timer = window.setInterval(tick, 100);
    tick();

    return () => {
      window.clearInterval(timer);
      v.removeEventListener('pause', stop);
      v.removeEventListener('seeking', stop);
      v.removeEventListener('ended', stop);
      v.removeEventListener('play', tick);
      v.removeEventListener('seeked', tick);
      v.removeEventListener('volumechange', onVolume);
      stop();
      if (owners.get(v) === me) owners.delete(v);
    };
    // onFailed is a notification, not an input: a new callback identity must
    // not restart the engine mid-line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef, segments, voice]);
}
