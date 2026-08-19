/**
 * Stage recording play button
 * ===========================
 * Plays an ended stage's recording where the card sits, rather than sending
 * you somewhere to find it. The reason it exists: a /stage/:id link for an
 * ended stage redirects to /stages, and the recording may not even be in that
 * page's twenty most recent — so the "Listen back" chip on a months-old post
 * led nowhere useful. Now the chip is the player.
 *
 * One `<audio>` for the whole app, held at module scope rather than in a
 * context, because a feed can mount dozens of these and two recordings talking
 * over each other is never what was wanted. Pressing play anywhere stops
 * whatever else was playing; every mounted button subscribes to the same id so
 * they all show the right state at once.
 *
 * Audio deliberately survives the button unmounting. These cards live in a
 * scrolling feed, and stopping playback because a post scrolled off would make
 * the feature useless — the element is shared, so any other stage card (and
 * the app's own tab-close) can still stop it.
 *
 * Renders as a <span role="button">, not a <button>: every surface that shows
 * this — the link embed above all — wraps the whole card in a <button>, and
 * nesting one inside another is invalid DOM.
 */

import { useCallback, useEffect, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { Play, Square, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type PlaybackState = { id: string | null; loading: boolean };

let audioEl: HTMLAudioElement | null = null;
let state: PlaybackState = { id: null, loading: false };
const subscribers = new Set<(next: PlaybackState) => void>();

function publish(next: PlaybackState) {
  state = next;
  for (const notify of subscribers) notify(state);
}

function ensureAudio(): HTMLAudioElement {
  if (audioEl) return audioEl;
  audioEl = new Audio();
  audioEl.preload = 'none';
  audioEl.addEventListener('ended', () => publish({ id: null, loading: false }));
  audioEl.addEventListener('error', () => {
    if (!state.id) return;
    toast.error('That recording could not be played');
    publish({ id: null, loading: false });
  });
  return audioEl;
}

/** Stop whatever is playing and release the source. */
export function stopStageRecording() {
  if (audioEl) {
    audioEl.pause();
    // Dropping the src is what actually frees the download; pause alone leaves
    // a part-buffered webm sitting in memory.
    audioEl.removeAttribute('src');
    audioEl.load();
  }
  publish({ id: null, loading: false });
}

async function playStageRecording(id: string, url: string) {
  const el = ensureAudio();
  // Same card pressed twice is a stop, not a restart.
  if (state.id === id) {
    stopStageRecording();
    return;
  }
  el.pause();
  el.src = url;
  publish({ id, loading: true });
  try {
    await el.play();
    publish({ id, loading: false });
  } catch {
    // Autoplay policy or a dead URL — either way the button must not stay lit.
    toast.error('That recording could not be played');
    publish({ id: null, loading: false });
  }
}

/** Subscribe to the shared player. */
function usePlaybackState(): PlaybackState {
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => {
    // Re-sync on mount: a card scrolled back into view must show that its own
    // recording is still the one playing.
    setSnapshot(state);
    subscribers.add(setSnapshot);
    return () => {
      subscribers.delete(setSnapshot);
    };
  }, []);
  return snapshot;
}

export function StageRecordingButton({
  spaceId,
  recordingUrl,
  className,
  label = 'Listen back',
}: {
  spaceId: string;
  /** No recording, no button — see the null return below. */
  recordingUrl?: string | null;
  className?: string;
  /** Chip text while stopped. Pass null for an icon-only control. */
  label?: string | null;
}) {
  const { id: playingId, loading } = usePlaybackState();
  const isPlaying = playingId === spaceId;

  const toggle = useCallback(
    (e: SyntheticEvent) => {
      // These sit inside cards that navigate on click.
      e.preventDefault();
      e.stopPropagation();
      if (!recordingUrl) return;
      void playStageRecording(spaceId, recordingUrl);
    },
    [spaceId, recordingUrl],
  );

  // A stage can end without a recording — the host may have blocked the mic
  // prompt, or the upload may have failed. A play button that cannot play is
  // worse than no button, so there isn't one.
  if (!recordingUrl) return null;

  const busy = isPlaying && loading;

  return (
    <span
      role="button"
      tabIndex={0}
      data-no-navigate
      aria-label={isPlaying ? 'Stop recording' : 'Play recording'}
      title={isPlaying ? 'Stop' : 'Play the recording'}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') toggle(e);
      }}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg text-xs font-medium shrink-0 cursor-pointer',
        'transition-colors select-none',
        label === null ? 'w-8 h-8 justify-center' : 'px-2.5 py-1',
        isPlaying
          ? 'bg-white text-black hover:bg-white/90'
          : 'bg-white/10 text-white hover:bg-white/20',
        className,
      )}
    >
      {busy ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : isPlaying ? (
        <Square className="w-3 h-3" fill="currentColor" />
      ) : (
        <Play className="w-3 h-3" fill="currentColor" />
      )}
      {label !== null && (isPlaying ? 'Playing' : label)}
    </span>
  );
}

export default StageRecordingButton;
