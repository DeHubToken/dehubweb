import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Download, Pause, Play, Share } from 'lucide-react';
import { decodeAudioWaveform } from '@/components/app/audio/visualizer-styles';
import { formatTime } from '@/lib/audio-waveform';
import { cn } from '@/lib/utils';
import { useGlobalDropZone } from '@/hooks/use-global-drop-zone';

interface GeneratedAudioPlayerProps {
  audioUrl: string;
  className?: string;
}

const WAVEFORM_BAR_COUNT = 64;

export function GeneratedAudioPlayer({ audioUrl, className }: GeneratedAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);
  const { openPostModal } = useGlobalDropZone();

  const displayPeaks = useMemo(() => {
    if (waveformPeaks.length > 0) return waveformPeaks;
    return Array.from({ length: WAVEFORM_BAR_COUNT }, (_, i) => {
      const t = i / (WAVEFORM_BAR_COUNT - 1);
      return 0.3 + Math.sin(t * Math.PI) * 0.45;
    });
  }, [waveformPeaks]);

  useEffect(() => {
    decodeAudioWaveform(audioUrl, WAVEFORM_BAR_COUNT, setWaveformPeaks);
  }, [audioUrl]);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    audioRef.current = audio;

    const syncDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const syncCurrentTime = () => setCurrentTime(audio.currentTime || 0);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => { setIsPlaying(false); setCurrentTime(audio.duration || 0); };

    audio.addEventListener('loadedmetadata', syncDuration);
    audio.addEventListener('durationchange', syncDuration);
    audio.addEventListener('timeupdate', syncCurrentTime);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', syncDuration);
      audio.removeEventListener('durationchange', syncDuration);
      audio.removeEventListener('timeupdate', syncCurrentTime);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audioRef.current = null;
    };
  }, [audioUrl]);

  const progress = duration > 0 ? currentTime / duration : 0;

  const seekTo = (time: number) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const nextTime = Math.max(0, Math.min(time, duration));
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try { await audio.play(); } catch (e) { console.error('Playback failed:', e); }
      return;
    }
    audio.pause();
  };

  const handleWaveformSeek = (event: MouseEvent<HTMLButtonElement>) => {
    if (!duration) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - bounds.left) / bounds.width;
    seekTo(duration * Math.max(0, Math.min(ratio, 1)));
  };

  return (
    <div
      className={cn(
        'w-full rounded-xl border border-white/10 bg-black/60 backdrop-blur-[24px] p-3',
        className,
      )}
    >
      {/* Main row: Play | Waveform | Actions */}
      <div className="flex items-center gap-2.5">
        {/* Play / Pause */}
        <button
          type="button"
          onClick={togglePlayback}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white transition-transform hover:scale-105 active:scale-95"
          aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
        >
          {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
        </button>

        {/* Waveform + time */}
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={handleWaveformSeek}
            className="relative h-10 w-full text-left"
            aria-label="Seek through audio waveform"
          >
            <div className="flex h-full items-center gap-[2px]">
              {displayPeaks.map((peak, index) => {
                const played = index / Math.max(displayPeaks.length - 1, 1) <= progress;
                const height = `${Math.max(16, peak * 100)}%`;
                return (
                  <div key={`${audioUrl}-${index}`} className="flex h-full flex-1 items-center">
                    <div
                      className={cn(
                        'w-full rounded-full transition-colors duration-150',
                        played ? 'bg-white' : 'bg-white/20'
                      )}
                      style={{ height }}
                    />
                  </div>
                );
              })}
            </div>
            {/* Playhead */}
            <div
              className="absolute inset-y-1 w-0.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)] transition-[left] duration-150"
              style={{ left: `calc(${progress * 100}% - 1px)` }}
            />
          </button>
          <div className="flex items-center justify-between mt-1 text-[10px] text-white/40">
            <span>{formatTime(currentTime)}</span>
            <span>-{formatTime(Math.max(duration - currentTime, 0))}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => openPostModal?.(`🎵 Check out this AI-generated track!\n\n${audioUrl}`)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 transition-colors hover:text-white hover:bg-white/10"
            aria-label="Post audio"
            title="Post to feed"
          >
            <Share className="h-3.5 w-3.5" />
          </button>
          <a
            href={audioUrl}
            download="dehub-audio.mp3"
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 transition-colors hover:text-white hover:bg-white/10"
            aria-label="Download audio"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
