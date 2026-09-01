import { useRef, useEffect, useState, useCallback, useMemo, useId } from 'react';
import { Play, Pause } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';
import {
  VisualizerStyle,
  drawBars,
  drawWaveform,
  drawCircular,
  drawSpectrum,
  drawMirror,
  drawRings,
  drawPulse,
  drawTerrain,
  drawStatic,
  decodeAudioWaveform,
  seededPeaks,
  idleFrequencyData,
  idleTimeData,
  resetSpectrum,
  resetRings,
  resetPulse,
  resetTerrain,
  resetStatic,
} from './visualizer-styles';

interface AudioVisualizerProps {
  audioUrl: string;
  isPlaying: boolean;
  onPlayPause: () => void;
  className?: string;
  showStylePicker?: boolean;
  /** When true the audio output is muted (visualizer still animates). */
  muted?: boolean;
  /** Seed for the static waveform style (e.g. post id). */
  seed?: string;
  /**
   * Gate for the full-track waveform decode: fetching + decodeAudioData on the
   * whole file costs 10s of MB + ~50ms main-thread per file, so feed cards
   * pass their near-viewport flag here. Until true, the seeded fallback
   * pattern renders instead. Defaults to true for non-feed usages.
   */
  decodeEnabled?: boolean;
  /**
   * Track length in seconds when the caller already knows it (the feed payload
   * carries `audioDuration`), so the scrubber can show a real total before
   * anything has been downloaded.
   */
  durationHint?: number;
}

const STYLES: { value: VisualizerStyle; label: string }[] = [
  { value: 'static', label: 'Default' },
  { value: 'bars', label: 'Bars' },
  { value: 'waveform', label: 'Wave' },
  { value: 'circular', label: 'Radial' },
  { value: 'spectrum', label: 'Spectrum' },
  { value: 'mirror', label: 'Mirror' },
  { value: 'rings', label: 'Rings' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'terrain', label: 'Terrain' },
];

const STATIC_BAR_COUNT = 100;
/** Matches `fftSize: 256` below — an idle frame has to be the analyser's size. */
const IDLE_BIN_COUNT = 128;
/** Pointer travel that turns a press on the canvas into a scrub. */
const SCRUB_THRESHOLD_PX = 6;
const EMPTY_DATA = new Uint8Array(0);

// Shared across all AudioVisualizer instances — see setupAudio for why.
let sharedVisualizerContext: AudioContext | null = null;

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

export function AudioVisualizer({
  audioUrl,
  isPlaying,
  onPlayPause,
  className = '',
  showStylePicker = true,
  muted = false,
  seed = 'default',
  decodeEnabled = true,
  durationHint = 0,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const { theme } = useAppTheme();
  const isLightTheme = theme === 'light';
  const animationRef = useRef<number | null>(null);
  const isConnectedRef = useRef(false);
  // framer-motion matches shared layout animations by layoutId across the whole
  // tree, so one literal id had every audio card in the feed fighting over a
  // single selection pill — picking a style on one card yanked the pill off
  // another, and the picker read as broken. One id per instance.
  const instanceId = useId();

  const [style, setStyle] = useState<VisualizerStyle>('static');
  const [hue, setHue] = useState(0);
  const [waveformPeaks, setWaveformPeaks] = useState<number[] | null>(null);
  const [duration, setDuration] = useState(durationHint);
  const [currentTime, setCurrentTime] = useState(0);
  const [scrubRatio, setScrubRatio] = useState<number | null>(null);
  // Bumped when the <audio> element is created, so the listener effect below
  // attaches no matter which path built it (near-viewport, play, or a seek).
  const [audioElVersion, setAudioElVersion] = useState(0);

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const scrubRatioRef = useRef<number | null>(null);
  scrubRatioRef.current = scrubRatio;
  const pendingSeekRef = useRef<number | null>(null);
  const peaksRef = useRef<number[] | null>(null);
  peaksRef.current = waveformPeaks;

  // Store onPlayPause in a ref to avoid dependency issues
  const onPlayPauseRef = useRef(onPlayPause);
  useEffect(() => {
    onPlayPauseRef.current = onPlayPause;
  }, [onPlayPause]);

  // Store muted prop in ref for use during setup
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  // Decode the audio file to get full-track waveform peaks — deferred until
  // the card is near the viewport (or playing) so a feed of audio posts
  // doesn't download + PCM-decode every track on mount.
  useEffect(() => {
    if (!decodeEnabled && !isPlaying) return;
    let stale = false;
    decodeAudioWaveform(audioUrl, STATIC_BAR_COUNT, (peaks) => {
      if (!stale) setWaveformPeaks(peaks);
    });
    return () => { stale = true; };
  }, [audioUrl, decodeEnabled, isPlaying]);

  /**
   * The <audio> element on its own, without the Web Audio graph. Split out of
   * `setupAudio` so the scrubber has a duration and a seek target before the
   * first play — the graph still waits for the click, which is what the
   * autoplay policy actually checks.
   */
  const ensureAudioElement = useCallback(() => {
    const existing = audioRef.current;
    if (existing) return existing;
    const el = new Audio();
    el.crossOrigin = 'anonymous';
    el.preload = 'metadata';
    el.muted = mutedRef.current;
    el.src = audioUrl;
    audioRef.current = el;
    setAudioElVersion((v) => v + 1);
    return el;
  }, [audioUrl]);

  // Metadata is cheap; the full-file decode next door is not, so both ride the
  // same near-viewport gate.
  useEffect(() => {
    if (!decodeEnabled && !isPlaying) return;
    ensureAudioElement();
  }, [decodeEnabled, isPlaying, ensureAudioElement]);

  // Keep the scrubber in step with the element, however it got there.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setCurrentTime(el.currentTime);
    const onMeta = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) {
        setDuration(el.duration);
        if (pendingSeekRef.current !== null) {
          el.currentTime = pendingSeekRef.current * el.duration;
          pendingSeekRef.current = null;
        }
      }
    };
    const onEnded = () => {
      el.currentTime = 0;
      setCurrentTime(0);
      onPlayPauseRef.current();
    };
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('seeked', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('durationchange', onMeta);
    el.addEventListener('ended', onEnded);
    onMeta();
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('seeked', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('durationchange', onMeta);
      el.removeEventListener('ended', onEnded);
    };
  }, [audioElVersion]);

  useEffect(() => {
    setDuration((d) => (d > 0 ? d : durationHint));
  }, [durationHint]);

  const setupAudio = useCallback(() => {
    if (isConnectedRef.current) return;

    try {
      const el = ensureAudioElement();

      // ONE AudioContext shared by every visualizer instance: Chrome caps ~6
      // live contexts per page, and feed cards live forever in persistent
      // pages — per-card contexts exhausted the cap after a few audio posts,
      // silently breaking later visualizers. Per-element sources/analysers
      // still attach to the shared context (one source per element is fine).
      if (!sharedVisualizerContext) {
        sharedVisualizerContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      audioContextRef.current = sharedVisualizerContext;

      const ctx = audioContextRef.current;

      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;

      sourceRef.current = ctx.createMediaElementSource(el);
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(ctx.destination);

      isConnectedRef.current = true;
    } catch (err) {
      console.error('Failed to setup audio:', err);
    }
  }, [ensureAudioElement]);

  /* ─── Canvas sizing ───────────────────────────────────────────────────────
     The backing store used to be a fixed 320×160 stretched by CSS to whatever
     the card was — soft, smeared bars on anything wider than a phone. Size it
     to its own box at device resolution instead. */
  const [canvasSize, setCanvasSize] = useState({ w: 320, h: 160 });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const apply = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);
      setCanvasSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    apply();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(apply);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  /* ─── Drawing ─────────────────────────────────────────────────────────── */

  const idleShape = useMemo(
    () => (waveformPeaks && waveformPeaks.length ? waveformPeaks : seededPeaks(seed, STATIC_BAR_COUNT)),
    [waveformPeaks, seed],
  );
  const idleFrequency = useMemo(() => idleFrequencyData(idleShape, IDLE_BIN_COUNT), [idleShape]);
  const idleTime = useMemo(() => idleTimeData(idleShape, IDLE_BIN_COUNT), [idleShape]);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    if (!width || !height) return;

    if (style === 'static') {
      const audio = audioRef.current;
      const played = audio && audio.duration ? audio.currentTime / audio.duration : 0;
      // A drag paints where the finger is, not where the audio is, so the
      // waveform tracks the scrub instead of lagging a whole gesture behind.
      const progress = scrubRatioRef.current ?? played;
      drawStatic(ctx, EMPTY_DATA, width, height, hue, seed, progress, peaksRef.current, STATIC_BAR_COUNT);
      return;
    }

    // Everything else reads the analyser while playing. Paused — or before the
    // graph exists — it gets a frame synthesised from the track's own waveform,
    // so picking a style always visibly changes the canvas.
    const analyser = analyserRef.current;
    let frequencyData = idleFrequency;
    let timeData = idleTime;
    if (analyser && isPlayingRef.current) {
      // Allocate and fill in one step: annotating these as `Uint8Array` widens
      // the buffer to ArrayBufferLike and CI rejects the analyser call, while
      // the local typecheck lets it through. See the TypedArray variance note.
      const freq = new Uint8Array(analyser.frequencyBinCount);
      const time = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(freq);
      analyser.getByteTimeDomainData(time);
      frequencyData = freq;
      timeData = time;
    }

    switch (style) {
      case 'bars':
        drawBars(ctx, frequencyData, width, height, hue);
        break;
      case 'waveform':
        drawWaveform(ctx, timeData, width, height, hue);
        break;
      case 'circular':
        drawCircular(ctx, frequencyData, width, height, hue);
        break;
      case 'spectrum':
        drawSpectrum(ctx, frequencyData, width, height, hue);
        break;
      case 'mirror':
        drawMirror(ctx, frequencyData, width, height, hue);
        break;
      case 'rings':
        drawRings(ctx, frequencyData, width, height, hue);
        break;
      case 'pulse':
        drawPulse(ctx, frequencyData, width, height, hue);
        break;
      case 'terrain':
        drawTerrain(ctx, frequencyData, width, height, hue);
        break;
    }
  }, [style, hue, seed, idleFrequency, idleTime]);

  const drawFrameRef = useRef(drawFrame);
  drawFrameRef.current = drawFrame;

  // ONE animation loop, started and stopped by isPlaying alone. It used to
  // restart on every `draw` identity change without cancelling the previous
  // frame, so changing style or dragging the hue slider mid-playback left a
  // second (then a third) rAF loop running against the same canvas.
  useEffect(() => {
    if (!isPlaying) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
      return;
    }
    let alive = true;
    const loop = () => {
      if (!alive) return;
      drawFrameRef.current();
      animationRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      alive = false;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    };
  }, [isPlaying]);

  // Repaint the idle frame whenever anything it depends on changes. Without
  // this a style picked while paused left the *previous* style's last frame on
  // the canvas, which is what "can't change the animation" looked like.
  useEffect(() => {
    if (isPlaying) return;
    drawFrame();
  }, [isPlaying, drawFrame, canvasSize, scrubRatio, currentTime]);

  useEffect(() => {
    resetSpectrum();
    resetRings();
    resetPulse();
    resetTerrain();
    resetStatic();
  }, [style]);

  /* ─── Playback ────────────────────────────────────────────────────────── */

  // Play/pause runs synchronously off the user gesture: setupAudio + play()
  // land in the same call-stack as the click, which is what the autoplay policy
  // checks.
  const handlePlayPause = useCallback(() => {
    if (!isPlayingRef.current && !isConnectedRef.current) {
      setupAudio();
    }
    onPlayPauseRef.current();
  }, [setupAudio]);

  // Separate effect for playback control — runs AFTER state update from parent
  useEffect(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.play().catch(console.error);
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, audioElVersion]);

  // Sync muted state
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = muted;
    }
  }, [muted]);

  /* ─── Seeking ─────────────────────────────────────────────────────────────
     Two surfaces share it: the slim bar under the controls, and the canvas
     itself — a waveform you cannot drag was the whole complaint. The bar, being
     a deliberate target, tracks from pointerdown. The canvas only commits on
     pointerup and only if the press was not a scroll (a scroll gets
     pointercancel), so flicking the feed past a card never nudges its
     position. */

  const seekTo = useCallback((ratio: number) => {
    const clamped = clamp01(ratio);
    const el = ensureAudioElement();
    const total = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
    if (!total) {
      // Metadata has not landed yet — the loadedmetadata handler applies this.
      pendingSeekRef.current = clamped;
      if (duration > 0) setCurrentTime(clamped * duration);
      return;
    }
    el.currentTime = clamped * total;
    setCurrentTime(clamped * total);
  }, [duration, ensureAudioElement]);

  const scrubStateRef = useRef<{ startX: number; moved: boolean; live: boolean } | null>(null);

  const ratioFrom = (el: HTMLElement, clientX: number) => {
    const rect = el.getBoundingClientRect();
    if (!rect.width) return 0;
    return clamp01((clientX - rect.left) / rect.width);
  };

  const beginScrub = useCallback((el: HTMLElement, e: React.PointerEvent, live: boolean) => {
    scrubStateRef.current = { startX: e.clientX, moved: false, live };
    try { el.setPointerCapture(e.pointerId); } catch { /* not captured — moves still arrive */ }
    if (live) setScrubRatio(ratioFrom(el, e.clientX));
  }, []);

  const moveScrub = useCallback((el: HTMLElement, e: React.PointerEvent) => {
    const state = scrubStateRef.current;
    if (!state) return;
    if (!state.moved && !state.live && Math.abs(e.clientX - state.startX) < SCRUB_THRESHOLD_PX) return;
    state.moved = true;
    setScrubRatio(ratioFrom(el, e.clientX));
  }, []);

  const endScrub = useCallback((el: HTMLElement, e: React.PointerEvent) => {
    const state = scrubStateRef.current;
    scrubStateRef.current = null;
    try { el.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (!state) return;
    seekTo(ratioFrom(el, e.clientX));
    setScrubRatio(null);
  }, [seekTo]);

  const cancelScrub = useCallback(() => {
    scrubStateRef.current = null;
    setScrubRatio(null);
  }, []);

  const handleSeekKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      handlePlayPause();
      return;
    }
    if (!duration) return;
    const step = e.shiftKey ? 10 : 5;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      seekTo((currentTime - step) / duration);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      seekTo((currentTime + step) / duration);
    } else if (e.key === 'Home') {
      e.preventDefault();
      seekTo(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      seekTo(1);
    }
  }, [currentTime, duration, seekTo, handlePlayPause]);

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current = null;
      }
      // Detach this card's nodes from the SHARED context (never close it —
      // other visualizers may be using it).
      sourceRef.current?.disconnect();
      sourceRef.current = null;
      analyserRef.current?.disconnect();
      analyserRef.current = null;
      audioContextRef.current = null;
      isConnectedRef.current = false;
      resetSpectrum();
      resetRings();
      resetPulse();
      resetTerrain();
      resetStatic();
    };
  }, []);

  const playedRatio = duration > 0 ? clamp01(currentTime / duration) : 0;
  const displayRatio = scrubRatio ?? playedRatio;
  const displayTime = scrubRatio !== null ? scrubRatio * duration : currentTime;
  const accent = hue === 0 ? 'hsla(0, 0%, 100%, 0.9)' : `hsla(${hue}, 85%, 65%, 0.95)`;

  const stopBubble = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div data-no-swipe className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        width={canvasSize.w}
        height={canvasSize.h}
        className="w-full h-full rounded-xl bg-black/40 select-none"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={(e) => beginScrub(e.currentTarget, e, false)}
        onPointerMove={(e) => moveScrub(e.currentTarget, e)}
        onPointerUp={(e) => endScrub(e.currentTarget, e)}
        onPointerCancel={cancelScrub}
      />

      {/* Controls. There is no centre overlay any more: the play button used to
          sit invisibly in the middle of the canvas and appear on hover, so a
          mouse anywhere near the card flashed a pause button, and the
          invisible-but-clickable box swallowed every press aimed at the
          waveform underneath it. */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-1.5 px-2 pb-2 pointer-events-none">
        {/* Scrubber */}
        <div className="flex items-center gap-2 pointer-events-auto" onClick={stopBubble}>
          <span className="text-[10px] font-medium text-white/70 tabular-nums drop-shadow shrink-0">
            {formatTime(displayTime)}
          </span>
          <div
            role="slider"
            tabIndex={0}
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.max(0, Math.round(duration))}
            aria-valuenow={Math.max(0, Math.round(displayTime))}
            aria-valuetext={`${formatTime(displayTime)} of ${formatTime(duration)}`}
            className="relative flex-1 h-4 flex items-center cursor-pointer outline-none"
            style={{ touchAction: 'none' }}
            onPointerDown={(e) => { e.stopPropagation(); beginScrub(e.currentTarget, e, true); }}
            onPointerMove={(e) => moveScrub(e.currentTarget, e)}
            onPointerUp={(e) => { e.stopPropagation(); endScrub(e.currentTarget, e); }}
            onPointerCancel={cancelScrub}
            onKeyDown={handleSeekKeyDown}
          >
            <div className="absolute inset-x-0 h-[3px] rounded-full bg-white/25" />
            <div
              className="absolute left-0 h-[3px] rounded-full"
              style={{ width: `${displayRatio * 100}%`, background: accent }}
            />
            <div
              className="absolute w-2.5 h-2.5 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.45)]"
              style={{ left: `${displayRatio * 100}%`, transform: 'translateX(-50%)' }}
            />
          </div>
          <span className="text-[10px] font-medium text-white/50 tabular-nums drop-shadow shrink-0">
            {formatTime(duration)}
          </span>
        </div>

        {/* Play, colour and style, bottom left */}
        <div
          className="flex items-end gap-2 pointer-events-auto"
          style={{ touchAction: 'pan-x' }}
          onClick={stopBubble}
          onPointerDown={stopBubble}
        >
          <button
            type="button"
            aria-label={isPlaying ? 'Pause' : 'Play'}
            onClick={(e) => { e.stopPropagation(); handlePlayPause(); }}
            className={cn(
              'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
              'bg-gradient-to-br from-white/25 via-white/15 to-white/8 backdrop-blur-xl border border-white/30',
              'hover:from-white/35 hover:via-white/25 hover:to-white/15',
              isLightTheme
                ? 'shadow-[0_2px_8px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.15)]'
                : 'shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.3)]',
            )}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 text-white fill-white" />
            ) : (
              <Play className="w-4 h-4 text-white fill-white ml-0.5" />
            )}
          </button>

          {showStylePicker && (
            <>
              {/* Colour slider - liquid glass bubble style */}
              <div
                className="relative px-2.5 py-1.5 rounded-lg bg-gradient-to-br from-white/25 via-white/15 to-white/8 backdrop-blur-xl border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.3)] shrink-0"
                onClick={stopBubble}
                onPointerDown={stopBubble}
              >
                <div
                  className="w-16 h-2 rounded-full relative overflow-hidden"
                  style={{
                    background: 'linear-gradient(to right, hsl(0, 80%, 60%), hsl(60, 80%, 60%), hsl(120, 80%, 60%), hsl(180, 80%, 60%), hsl(240, 80%, 60%), hsl(300, 80%, 60%), hsl(360, 80%, 60%))'
                  }}
                >
                  <Slider
                    value={[hue]}
                    min={0}
                    max={360}
                    step={1}
                    onValueChange={(value) => setHue(value[0])}
                    className="absolute inset-0 w-full [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:-top-0.5 [&_[role=slider]]:border-2 [&_[role=slider]]:border-white [&_[role=slider]]:shadow-md [&_.relative]:bg-transparent [&_[data-orientation=horizontal]]:h-2 [&_[class*=Range]]:bg-transparent [&_[class*=Track]]:bg-transparent"
                  />
                </div>
              </div>

              {/* Style picker - scrollable */}
              <div className="flex-1 min-w-0 overflow-x-auto scrollbar-none">
                <div className="flex gap-1 w-max">
                  {STYLES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setStyle(s.value);
                      }}
                      onPointerDown={stopBubble}
                      onTouchStart={stopBubble}
                      className="relative px-2.5 py-1 text-[10px] font-medium rounded-lg whitespace-nowrap transition-colors text-white/60 hover:text-white/80"
                    >
                      {style === s.value && (
                        <motion.div
                          layoutId={`audio-style-indicator-${instanceId}`}
                          className={cn(
                            "absolute inset-0 rounded-lg bg-gradient-to-br from-white/25 via-white/15 to-white/8 backdrop-blur-xl border border-white/30",
                            isLightTheme
                              ? "shadow-[0_2px_8px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.15)]"
                              : "shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.3)]"
                          )}
                          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        />
                      )}
                      <span className={`relative z-10 ${style === s.value ? 'text-white' : ''}`}>{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
