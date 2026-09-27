import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react';
import { videoPlaybackManager } from '@/lib/video-playback-manager';

export function useImageSoundtrack(url: string | undefined, anchor: RefObject<HTMLElement>, enabled: boolean) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const owner = useId();
  const wanted = useRef(false);
  const generation = useRef(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const pause = useCallback(() => {
    wanted.current = false;
    generation.current++;
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
    audioRef.current?.pause();
    setPlaying(false);
    setLoading(false);
    videoPlaybackManager.stop(owner);
  }, [owner]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !enabled || !url) return;
    if (wanted.current || !audio.paused) { pause(); return; }
    const attempt = ++generation.current;
    wanted.current = true;
    setError(false);
    setLoading(true);
    timeout.current = setTimeout(() => { pause(); setError(true); }, 15000);
    videoPlaybackManager.claimAudio(owner);
    videoPlaybackManager.play(owner);
    // Attach only on intent: a feed of image posts must not download music.
    if (audio.getAttribute('src') !== url || audio.error || error) {
      audio.src = url;
      audio.load();
    }
    audio.play().then(() => {
      if (generation.current === attempt && !wanted.current) audio.pause();
    }).catch(() => {
      if (generation.current !== attempt) return;
      pause();
      setError(true);
    });
  }, [enabled, owner, pause, url, error]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !url || !enabled) { pause(); return; }
    const onPlaying = () => {
      if (!wanted.current) { audio.pause(); return; }
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = null;
      setPlaying(true);
      setLoading(false);
    };
    const onPause = () => pause();
    const onWaiting = () => {
      if (!wanted.current) return;
      setLoading(true);
      if (!timeout.current) timeout.current = setTimeout(() => { pause(); setError(true); }, 15000);
    };
    const onError = () => { pause(); setError(true); };
    const onHidden = () => { if (document.hidden) pause(); };
    const onOtherPlay = (event: Event) => {
      const other = event.target;
      if (other instanceof HTMLMediaElement && other !== audio && !other.muted) pause();
    };
    videoPlaybackManager.register(owner, pause, (muted) => { if (muted) pause(); });
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('error', onError);
    document.addEventListener('visibilitychange', onHidden);
    document.addEventListener('play', onOtherPlay, true);
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) pause();
    });
    if (anchor.current) observer.observe(anchor.current);
    setError(false);
    return () => {
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('error', onError);
      document.removeEventListener('visibilitychange', onHidden);
      document.removeEventListener('play', onOtherPlay, true);
      observer.disconnect();
      pause();
      audio.removeAttribute('src');
      audio.load();
      videoPlaybackManager.unregister(owner);
    };
  }, [url, enabled, anchor, owner, pause]);

  return { audioRef, playing, loading, error, toggle };
}
