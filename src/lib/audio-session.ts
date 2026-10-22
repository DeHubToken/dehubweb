/**
 * iPhone Safari's audio session, for everything that plays or records audio.
 *
 * Web Audio output on an iPhone is muted by the ring switch unless the page
 * asks for a 'playback' session (Safari 16.4+; other browsers have no
 * navigator.audioSession and this all does nothing). Audio posts ask for it,
 * and so does stage recording playback, which plays through Web Audio for its
 * level meter.
 *
 * A stage microphone should not be opened under that session: 'playback' is
 * the music-app category, and the page asked for it before it ever wanted a
 * mic. So while a mic is open the type goes back to 'auto', the session every
 * web call runs in, and whatever was there before comes back once it closes.
 */

type SessionType = 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record';

function session(): { type: SessionType } | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { audioSession?: { type: SessionType } }).audioSession;
}

function setType(type: SessionType | null) {
  const s = session();
  if (!s || !type || s.type === type) return;
  try {
    s.type = type;
  } catch {
    /* read-only on some builds */
  }
}

let wantsPlayback = false;
let openMics = 0;
let beforeMic: SessionType | null = null;

/** Keep Web Audio output audible with the ring switch on silent. */
export function requestPlaybackAudioSession(): void {
  wantsPlayback = true;
  if (openMics === 0) setType('playback');
}

/** Call when a microphone opens; call the returned function when it closes. */
export function holdMicAudioSession(): () => void {
  if (openMics === 0) beforeMic = session()?.type ?? null;
  openMics++;
  setType('auto');
  let released = false;
  return () => {
    if (released) return;
    released = true;
    openMics = Math.max(0, openMics - 1);
    if (openMics > 0) return;
    setType(wantsPlayback ? 'playback' : beforeMic);
    beforeMic = null;
  };
}
