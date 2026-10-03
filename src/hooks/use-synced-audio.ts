import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';
import { claimHandoffAudio, getHandoffAudio, isHandoffAudioActive, releaseHandoffAudio, setHandoffAudio, subscribeHandoffAudio } from '@/lib/audio-handoff';

interface UseSyncedAudioOptions {
  mediaKey: string;
  soundtrackUrl?: string;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  videoRef: React.RefObject<HTMLVideoElement>;
}

/** The soundtrack travels with the video instead of rebuilding on navigation. */
export function useSyncedAudio({ mediaKey, soundtrackUrl, isPlaying, isMuted, volume, videoRef }: UseSyncedAudioOptions) {
  const surfaceActive = useContext(CachedPageActiveContext);
  const key = soundtrackUrl ? `synced:${mediaKey}:${soundtrackUrl}` : '';
  const token = useRef<object | null>(null);
  const [, refresh] = useState(0);
  useLayoutEffect(() => {
    if (!key || !soundtrackUrl || !surfaceActive) return;
    token.current = claimHandoffAudio(key, () => videoRef.current, mediaKey);
    if (!getHandoffAudio(key, token.current)) {
      const el = new Audio();
      el.preload = 'none';
      el.src = soundtrackUrl;
      setHandoffAudio(key, token.current, { el, source: null, analyser: null });
    }
    const unsubscribe = subscribeHandoffAudio(key, () => refresh(version => version + 1));
    refresh(version => version + 1);
    return () => {
      unsubscribe();
      releaseHandoffAudio(key, token.current!);
      token.current = null;
    };
  }, [key, soundtrackUrl, videoRef, surfaceActive, mediaKey]);
  const active = isHandoffAudioActive(key, token.current);
  useEffect(() => {
    const audio = getHandoffAudio(key, token.current)?.el;
    const video = videoRef.current;
    if (!active || !audio || !video) return;
    audio.muted = isMuted;
    audio.volume = volume;
    audio.playbackRate = video.playbackRate;
    video.muted = true;
    if (!video.paused) {
      if (Math.abs(audio.currentTime - video.currentTime) > 0.3) audio.currentTime = video.currentTime;
      if (audio.paused) audio.play().catch(() => {});
    } else audio.pause();
  }, [active, key, isPlaying, isMuted, volume, videoRef]);
  useEffect(() => {
    const video = videoRef.current;
    const audio = getHandoffAudio(key, token.current)?.el;
    if (!active || !video || !audio) return;
    const owns = () => isHandoffAudioActive(key, token.current) && videoRef.current === video;
    const sync = () => {
      if (!owns()) return;
      audio.playbackRate = video.playbackRate;
      if (Math.abs(audio.currentTime - video.currentTime) > 0.3) audio.currentTime = video.currentTime;
    };
    const pause = () => { if (owns()) audio.pause(); };
    const play = () => { if (owns() && !video.paused && audio.paused) { sync(); audio.play().catch(() => {}); } };
    const events = { seeked: sync, timeupdate: sync, ratechange: sync, waiting: pause, pause, ended: pause, playing: play };
    Object.entries(events).forEach(([name, callback]) => video.addEventListener(name, callback));
    return () => Object.entries(events).forEach(([name, callback]) => video.removeEventListener(name, callback));
  }, [active, key, videoRef]);
  return { hasSoundtrack: !!soundtrackUrl };
}
