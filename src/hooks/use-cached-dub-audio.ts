import { useEffect, useRef } from 'react';
import { useMediaVolume } from '@/lib/video-preferences';
import { applyVideoVolume, dubLevelGain, dubVoiceVolume, setDubMixActive, useDubMix } from '@/lib/dub-mix';
const owners = new WeakSet<HTMLVideoElement>();

export function useCachedDubAudio(videoRef: React.RefObject<HTMLVideoElement>, url: string | null, onFailed: () => void) {
  const master = useMediaVolume();
  const mix = useDubMix();
  const settings = useRef({ master, mix, onFailed });
  settings.current = { master, mix, onFailed };
  const syncRef = useRef<() => void>(() => {});
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url || owners.has(video)) return;
    owners.add(video);
    const audio = new Audio(url);
    audio.preload = 'auto';
    let disposed = false;
    let blocked = false;
    let playing = false;
    const restore = () => {
      setDubMixActive(video, false, 1);
      applyVideoVolume(video, settings.current.master);
    };
    const fail = () => {
      if (disposed || blocked) return;
      blocked = true;
      audio.pause();
      restore();
      settings.current.onFailed();
    };
    const sync = () => {
      if (disposed || blocked) return;
      const { master, mix } = settings.current;
      audio.volume = dubVoiceVolume(master);
      audio.muted = video.muted;
      audio.playbackRate = video.playbackRate;
      if (audio.readyState < 2) return;
      setDubMixActive(video, true, dubLevelGain(mix.original));
      applyVideoVolume(video, master);
      if (Math.abs(audio.currentTime - video.currentTime) > 0.25) audio.currentTime = video.currentTime;
      if (video.paused || video.ended || video.seeking || video.muted || master === 0) {
        audio.pause();
      } else if (audio.paused && !playing) {
        playing = true;
        void audio.play().catch((error) => { if (error?.name !== 'AbortError') fail(); }).finally(() => { playing = false; });
      }
    };
    const pauseForBuffer = () => audio.pause();
    const events = ['play', 'playing', 'pause', 'seeking', 'seeked', 'timeupdate', 'volumechange', 'ratechange', 'ended'] as const;
    events.forEach((event) => video.addEventListener(event, sync));
    video.addEventListener('waiting', pauseForBuffer);
    audio.addEventListener('canplay', sync);
    audio.addEventListener('error', fail);
    syncRef.current = sync;
    sync();
    return () => {
      disposed = true;
      syncRef.current = () => {};
      events.forEach((event) => video.removeEventListener(event, sync));
      video.removeEventListener('waiting', pauseForBuffer);
      audio.removeEventListener('canplay', sync);
      audio.removeEventListener('error', fail);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      owners.delete(video);
      restore();
    };
  }, [videoRef, url]);
  useEffect(() => { syncRef.current(); }, [master, mix]);
}
