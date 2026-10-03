import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { videoPlaybackManager } from '@/lib/video-playback-manager';
import { claimHandoffAudio, getHandoffAudio, isHandoffAudioActive, releaseHandoffAudio, setHandoffAudio, subscribeHandoffAudio } from '@/lib/audio-handoff';

export function useImageSoundtrack(url: string | undefined, anchor: RefObject<HTMLElement>, enabled: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const key = url ? `soundtrack:${url}` : '';
  const token = useRef<object | null>(null);
  const [, refresh] = useState(0);
  const owner = useId();
  const wanted = useRef(false);
  const generation = useRef(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useLayoutEffect(() => {
    if (!key) return;
    token.current = claimHandoffAudio(key, () => anchor.current);
    if (!getHandoffAudio(key)) {
      const el = new Audio();
      el.loop = true;
      el.preload = 'none';
      setHandoffAudio(key, token.current, { el, source: null, analyser: null });
    }
    const adopt = () => {
      audioRef.current = isHandoffAudioActive(key, token.current) ? getHandoffAudio(key)?.el ?? null : null;
      wanted.current = !!audioRef.current && !audioRef.current.paused;
      setPlaying(wanted.current);
      setLoading(false);
      refresh(version => version + 1);
    };
    adopt();
    const unsubscribe = subscribeHandoffAudio(key, adopt);
    return () => {
      unsubscribe();
      if (timeout.current) clearTimeout(timeout.current);
      generation.current++;
      releaseHandoffAudio(key, token.current!);
      token.current = null;
      audioRef.current = null;
    };
  }, [key, anchor]);

  const pause = useCallback(() => {
    if (!isHandoffAudioActive(key, token.current)) return;
    wanted.current = false;
    generation.current++;
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
    audioRef.current?.pause();
    setPlaying(false);
    setLoading(false);
    videoPlaybackManager.stop(owner);
  }, [owner, key]);

  const toggle = useCallback(() => {
    if (!enabled || !url || !isHandoffAudioActive(key, token.current)) return;
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio();
      audio.loop = true;
      audio.preload = 'none';
      audioRef.current = audio;
      setHandoffAudio(key, token.current, { el: audio, source: null, analyser: null });
      refresh(version => version + 1);
    }
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
      if (isHandoffAudioActive(key, token.current) && generation.current === attempt && !wanted.current) audio.pause();
    }).catch(() => {
      if (!isHandoffAudioActive(key, token.current) || generation.current !== attempt) return;
      pause();
      setError(true);
    });
  }, [enabled, owner, pause, url, error, key]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !url || !enabled) { pause(); return; }
    const onPlaying = () => {
      if (!isHandoffAudioActive(key, token.current)) return;
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
    if (!audio.paused && isHandoffAudioActive(key, token.current)) {
      videoPlaybackManager.claimAudio(owner);
      videoPlaybackManager.play(owner);
    }
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('error', onError);
    if (!audio.paused && wanted.current) onPlaying();
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
      videoPlaybackManager.unregister(owner);
    };
  }, [url, enabled, anchor, owner, pause, key, audioRef.current]);

  return { audioRef, playing, loading, error, toggle };
}
