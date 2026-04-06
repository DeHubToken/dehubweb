import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Download, Pause, Play, Share } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { decodeAudioWaveform } from '@/components/app/audio/visualizer-styles';
import { formatTime } from '@/lib/audio-waveform';
import { cn } from '@/lib/utils';
import { useGlobalDropZone } from '@/hooks/use-global-drop-zone';

interface GeneratedAudioPlayerProps {
  audioUrl: string;
  className?: string;
}

const WAVEFORM_BAR_COUNT = 96;

export function GeneratedAudioPlayer({ audioUrl, className }: GeneratedAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);

  const displayPeaks = useMemo(() => {
    if (waveformPeaks.length > 0) return waveformPeaks;

    return Array.from({ length: WAVEFORM_BAR_COUNT }, (_, index) => {
      const t = index / (WAVEFORM_BAR_COUNT - 1);
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

    const syncDuration = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };

    const syncCurrentTime = () => {
      setCurrentTime(audio.currentTime || 0);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(audio.duration || 0);
    };

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
      try {
        await audio.play();
      } catch (error) {
        console.error('Failed to play generated audio:', error);
      }
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
        'w-full rounded-[1.75rem] border border-border/70 bg-card/70 p-4 text-card-foreground shadow-[0_12px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:p-5',
        className,
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlayback}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-primary text-primary-foreground shadow-[0_8px_24px_rgba(0,0,0,0.22)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
            aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
          >
            {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current ml-0.5" />}
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-card-foreground">Generated audio</p>
            <p className="text-xs text-muted-foreground">
              {duration > 0 ? `${formatTime(currentTime)} / ${formatTime(duration)}` : 'Preparing audio controls…'}
            </p>
          </div>

          <a
            href={audioUrl}
            download="dehub-audio.mp3"
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-background/60 text-foreground transition-colors hover:bg-accent"
            aria-label="Download audio"
          >
            <Download className="h-4 w-4" />
          </a>
        </div>

        <button
          type="button"
          onClick={handleWaveformSeek}
          className="group relative h-28 w-full overflow-hidden rounded-[1.5rem] border border-border/60 bg-background/40 px-3 py-3 text-left"
          aria-label="Seek through audio waveform"
        >
          <div
            className="absolute inset-y-0 left-0 rounded-[1.5rem] bg-foreground/5 transition-[width] duration-150"
            style={{ width: `${progress * 100}%` }}
          />
          <div className="relative flex h-full items-center gap-[3px]">
            {displayPeaks.map((peak, index) => {
              const played = index / Math.max(displayPeaks.length - 1, 1) <= progress;
              const height = `${Math.max(16, peak * 100)}%`;

              return (
                <div key={`${audioUrl}-${index}`} className="flex h-full flex-1 items-center">
                  <div
                    className={cn(
                      'w-full rounded-full transition-colors duration-150',
                      played ? 'bg-foreground' : 'bg-muted-foreground/35'
                    )}
                    style={{ height }}
                  />
                </div>
              );
            })}
          </div>
          <div
            className="absolute inset-y-3 w-0.5 rounded-full bg-foreground shadow-[0_0_12px_rgba(255,255,255,0.55)] transition-[left] duration-150"
            style={{ left: `calc(${progress * 100}% - 1px)` }}
          />
        </button>

        <div className="space-y-2">
          <Slider
            value={[duration > 0 ? currentTime : 0]}
            min={0}
            max={duration > 0 ? duration : 100}
            step={0.1}
            onValueChange={([value]) => seekTo(value)}
            className="w-full [&_[role=slider]]:h-4 [&_[role=slider]]:w-4 [&_[role=slider]]:border-2 [&_[role=slider]]:border-primary [&_[role=slider]]:bg-background [&_[role=slider]]:shadow-md [&_[data-orientation=horizontal]]:h-3 [&_[data-orientation=horizontal]>span]:h-3"
            aria-label="Audio progress"
          />

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{formatTime(currentTime)}</span>
            <span>-{formatTime(Math.max(duration - currentTime, 0))}</span>
          </div>
        </div>
      </div>
    </div>
  );
}