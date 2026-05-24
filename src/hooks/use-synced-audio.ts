/**
 * Synced Audio Hook
 * ==================
 * Synchronizes a hidden <audio> element with a <video> element
 * so that a soundtrack plays seamlessly over video content.
 */

import { useRef, useEffect } from 'react';

interface UseSyncedAudioOptions {
  /** URL of the soundtrack to play over the video */
  soundtrackUrl?: string;
  /** Whether the video is currently playing */
  isPlaying: boolean;
  /** Whether audio is muted */
  isMuted: boolean;
  /** Current volume (0-1) */
  volume: number;
  /** Reference to the video element */
  videoRef: React.RefObject<HTMLVideoElement>;
}

interface UseSyncedAudioReturn {
  /** Reference to the hidden audio element — render it in JSX */
  audioRef: React.RefObject<HTMLAudioElement>;
  /** Whether a soundtrack is active */
  hasSoundtrack: boolean;
}

export function useSyncedAudio({
  soundtrackUrl,
  isPlaying,
  isMuted,
  volume,
  videoRef,
}: UseSyncedAudioOptions): UseSyncedAudioReturn {
  const audioRef = useRef<HTMLAudioElement>(null);
  const hasSoundtrack = !!soundtrackUrl;

  // Sync play/pause
  useEffect(() => {
    const audio = audioRef.current;
    const video = videoRef.current;
    if (!audio || !soundtrackUrl) return;

    if (isPlaying) {
      if (video) audio.currentTime = video.currentTime;
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isPlaying, soundtrackUrl]);

  // Sync mute and volume
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = isMuted;
    audio.volume = volume;
  }, [isMuted, volume]);

  // Sync seek — when video seeks, match audio position
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio || !soundtrackUrl) return;

    const handleSeeked = () => {
      audio.currentTime = video.currentTime;
    };

    const handleEnded = () => {
      audio.pause();
      audio.currentTime = 0;
    };

    // Keep audio in rough sync on timeupdate (drift correction)
    const handleTimeUpdate = () => {
      if (Math.abs(video.currentTime - audio.currentTime) > 0.3) {
        audio.currentTime = video.currentTime;
      }
    };

    // If video is waiting (buffering), pause audio too
    const handleWaiting = () => {
      audio.pause();
    };

    const handlePlaying = () => {
      if (!video.paused) {
        audio.play().catch(() => {});
      }
    };

    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);

    return () => {
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
    };
  }, [soundtrackUrl]);

  // Mute video's native audio when soundtrack is active
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !soundtrackUrl) return;
    // Store original muted state isn't needed — we just force-mute native audio
    video.muted = true;

    return () => {
      // Restore — let the caller handle muted state
    };
  }, [soundtrackUrl]);

  return { audioRef, hasSoundtrack };
}
