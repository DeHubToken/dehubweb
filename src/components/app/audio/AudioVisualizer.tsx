import { useMediaVolume, useMediaMuted, setVolume, setMediaMuted as setSelfMuted } from '@/lib/video-preferences';
import { videoPlaybackManager } from '@/lib/video-playback-manager';
import * as React from 'react';
import { useRef, useContext, useEffect, useLayoutEffect, useState, useCallback, useMemo } from 'react';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';
import { useTranslation } from 'react-i18next';
import {
  popOutAudioPost,
  takeBackAudioPost,
  toggleAudioPost,
  useAudioPostPlayback,
  type AudioPostTrack,
} from '@/lib/audio-post-playback';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, PictureInPicture2 } from 'lucide-react';
import { MediaControlIcon } from '@/components/app/video/MediaControlIcon';
import { useVideoScrubZone } from '@/hooks/use-video-scrub-zone';
import { useAppTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { registerOffDocumentMedia } from '@/lib/pause-media-in';
import {
  claimHandoffAudio,
  getHandoffAudio,
  detachHandoffAudio,
  isHandoffAudioActive,
  releaseHandoffAudio,
  setHandoffAudio,
  subscribeHandoffAudio,
  type AudioHandoffGraph,
} from '@/lib/audio-handoff';
import { Slider } from '@/components/ui/slider';
import { useScrollFadeMask } from '@/components/app/feeds/useScrollFadeMask';
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
  drawOrb,
  drawStatic,
  setVisualizerInk,
  decodeAudioWaveform,
  seededPeaks,
  idleFrequencyData,
  idleTimeData,
  resetSpectrum,
  resetRings,
  resetPulse,
  resetTerrain,
  resetOrb,
  resetStatic,
} from './visualizer-styles';
import {
  AudioListener,
  EXTRA_STYLES,
  drawExtra,
  isExtraStyle,
  makePalette,
  type ExtraStyle,
} from './visualizer-extra';

/** The original ten plus the extras. */
type AnyStyle = VisualizerStyle | ExtraStyle;

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
  /**
   * Fullscreen, owned by the caller. It has to be, because only the caller
   * knows which element carries the chrome — `use-video-fullscreen` puts one
   * element in the top layer and everything outside it stops painting, so
   * fullscreening the canvas alone would strand these controls on the hidden
   * page. VideoCard passes its media container, which holds both. Without
   * `onFullscreen` the button is not drawn at all.
   */
  onFullscreen?: (e: React.MouseEvent) => void;
  isFullscreen?: boolean;
  /**
   * Off for a caller that already draws its own media overlay — the
   * composer preview puts the file name and a Music badge exactly there, and
   * two things in one corner is worse than no volume control.
   */
  showVolume?: boolean;
  onMuteChange?: (muted: boolean) => void;
  /**
   * What the corner player shows for this post. When given, a pop-out control
   * is drawn beside fullscreen; without it there is nothing to pop out to.
   */
  popoutTrack?: AudioPostTrack;
  /**
   * The corner player took the track (`poppedOut` true) or gave it back with
   * this play state. The card owning `isPlaying` uses it to step aside while
   * the track is out, so two players never claim the media session at once.
   */
  onPopOutChange?: (poppedOut: boolean, playing: boolean) => void;
  /**
   * Post id. Cards showing the same post share one player through
   * lib/audio-handoff, so opening a post from the feed picks the track up
   * mid-track instead of restarting it. Without a key the card owns its
   * player outright — right for the composer preview and voice notes, which
   * exist in one place only.
   */
  handoffKey?: string;
  /**
   * This card has taken the shared player over and it is (or is not) already
   * playing. The card owning `isPlaying` uses it to fall into step — the post
   * page opens on a track that is already running, and going back to a feed
   * whose track was paused on the post page must not show it as playing.
   */
  onPlaybackAdopted?: (playing: boolean) => void;
}

const STYLES: { value: AnyStyle; label: string }[] = [
  { value: 'static', label: 'Default' },
  { value: 'bars', label: 'Bars' },
  { value: 'waveform', label: 'Wave' },
  { value: 'circular', label: 'Radial' },
  { value: 'spectrum', label: 'Spectrum' },
  { value: 'mirror', label: 'Mirror' },
  { value: 'rings', label: 'Rings' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'terrain', label: 'Terrain' },
  { value: 'orb', label: 'Orb' },
  ...EXTRA_STYLES,
];

/** One height for every control in the bottom row, so they line up. */
const CONTROL_H = 'h-8';
/** The liquid-glass surface all three controls share. */
const GLASS_PILL =
  'rounded-lg bg-gradient-to-br from-white/25 via-white/15 to-white/8 backdrop-blur-xl border border-white/30';
const HUE_GRADIENT =
  'linear-gradient(to right, hsl(0, 80%, 60%), hsl(60, 80%, 60%), hsl(120, 80%, 60%), hsl(180, 80%, 60%), hsl(240, 80%, 60%), hsl(300, 80%, 60%), hsl(360, 80%, 60%))';

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
  isPlaying: isPlayingProp,
  onPlayPause,
  className = '',
  showStylePicker = true,
  muted = false,
  seed = 'default',
  decodeEnabled = true,
  durationHint = 0,
  onFullscreen,
  isFullscreen = false,
  showVolume = true,
  onMuteChange,
  popoutTrack,
  onPopOutChange,
  handoffKey,
  onPlaybackAdopted,
}: AudioVisualizerProps) {
  const surfaceActive = useContext(CachedPageActiveContext);
  const { t } = useTranslation();
  /* ─── The corner player ──────────────────────────────────────────────
     While this post is popped out the track lives in lib/audio-post-playback
     and this component is a view onto it: the play state comes from there,
     play/pause is forwarded, and the element it handed over is not touched
     on unmount. The element and the analyser chain stay where they are — the
     card keeps animating off the same graph while it is on screen. */
  const shared = useAudioPostPlayback();
  const isPoppedOut = !!popoutTrack && shared.tokenId === popoutTrack.tokenId;
  const isPoppedOutRef = useRef(isPoppedOut);
  isPoppedOutRef.current = isPoppedOut;
  /** True from hand-over until the element comes back or the engine drops it. */
  const handedOverRef = useRef(false);
  const isPlaying = isPoppedOut ? shared.isPlaying : isPlayingProp;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  /**
   * The <audio> element is never put in the document — the canvas is what goes
   * on screen, the element only makes the sound. PersistentPageCache pauses a
   * page's media by walking its subtree, so it could not see this one at all:
   * a track started in the feed kept playing through every later navigation.
   * Registering it against the canvas is what puts it back on that page's books.
   */
  const unregisterMediaRef = useRef<(() => void) | null>(null);
  const releaseOffDocument = useCallback(() => {
    unregisterMediaRef.current?.();
    unregisterMediaRef.current = null;
  }, []);
  /** Take an element on as this card's, and as this page's. */
  const adoptAudioElement = useCallback((el: HTMLAudioElement) => {
    releaseOffDocument();
    unregisterMediaRef.current = registerOffDocumentMedia(el, () => canvasRef.current);
    audioRef.current = el;
  }, [releaseOffDocument]);

  /* ─── The shared player ──────────────────────────────────────────────
     Every card showing this post claims the same <audio> element and the
     Web Audio chain around it (lib/audio-handoff), innermost claim wins. So
     opening a post from the feed does not restart the track: the post page's
     card takes the running player over, and closing it hands the player
     straight back down to the feed card, which never unmounted.

     A card that does not hold the claim still SHOWS the track — its scrubber
     and waveform read the shared element — but may not write to it. Two cards
     both forwarding play/pause and both setting `muted` is the whole reason
     the claim exists. */
  const claimRef = useRef<object | null>(null);
  const handoffKeyRef = useRef(handoffKey);
  handoffKeyRef.current = handoffKey;
  // Bumped whenever the player changes hands, so everything below re-reads it.
  const [claimVersion, setClaimVersion] = useState(0);
  const isActiveClaim = surfaceActive && (!handoffKey || isHandoffAudioActive(handoffKey, claimRef.current));
  const isActiveClaimRef = useRef(isActiveClaim);
  isActiveClaimRef.current = isActiveClaim;
  const onPlaybackAdoptedRef = useRef(onPlaybackAdopted);
  onPlaybackAdoptedRef.current = onPlaybackAdopted;
  const adoptionPendingRef = useRef<boolean | null>(null);

  const { theme } = useAppTheme();
  const isLightTheme = theme === 'light';
  const animationRef = useRef<number | null>(null);
  const isConnectedRef = useRef(false);
  // The presets do not fit a narrow card. Mask whichever edge is actually
  // hiding one — a painted gradient strip would have to guess the colour of
  // the artwork behind it, which is why they are banned repo-wide.
  const { ref: chipScrollRef, style: chipFadeStyle } = useScrollFadeMask<HTMLDivElement>();

  // Every card starts on Default; a pick sticks until it unmounts.
  const [style, setStyle] = useState<AnyStyle>('static');
  const listenerRef = useRef<AudioListener | null>(null);
  const extraStateRef = useRef<Record<string, unknown>>({});
  const [hue, setHue] = useState(0);
  const [waveformPeaks, setWaveformPeaks] = useState<number[] | null>(null);
  const [duration, setDuration] = useState(durationHint);
  const [currentTime, setCurrentTime] = useState(0);
  const [scrubRatio, setScrubRatio] = useState<number | null>(null);
  const volume = useMediaVolume();
  const selfMuted = useMediaMuted();
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
   * Point this card's refs at `graph` — the shared player, arriving from the
   * pool or back from the corner player. `isConnectedRef` matters: an element
   * may only be given a MediaElementSource ONCE for the life of the page, and
   * an element that has one is audible only through it. So a card taking the
   * player over adopts the chain rather than building a second one.
   */
  const adoptGraph = useCallback((graph: AudioHandoffGraph) => {
    audioRef.current = graph.el;
    sourceRef.current = graph.source;
    analyserRef.current = graph.analyser;
    audioContextRef.current = graph.source ? sharedVisualizerContext : null;
    isConnectedRef.current = !!graph.source;
    setAudioElVersion((v) => v + 1);
  }, []);

  /**
   * The <audio> element on its own, without the Web Audio graph. Split out of
   * `setupAudio` so the scrubber has a duration and a seek target before the
   * first play — the graph still waits for the click, which is what the
   * autoplay policy actually checks.
   *
   * Null when this card is keyed into a shared player it does not hold: the
   * card on top builds it, and building a second element here would download
   * the track twice and leave an orphan nothing ever tears down.
   */
  const ensureAudioElement = useCallback((): HTMLAudioElement | null => {
    const existing = audioRef.current;
    if (existing) return existing;
    if (handoffKey) {
      const shared = getHandoffAudio(handoffKey, claimRef.current);
      if (shared) {
        adoptGraph(shared);
        return shared.el;
      }
      if (!isHandoffAudioActive(handoffKey, claimRef.current)) return null;
    }
    const el = new Audio();
    el.crossOrigin = 'anonymous';
    el.preload = 'metadata';
    el.muted = mutedRef.current;
    el.src = audioUrl;
    if (handoffKey) {
      // The pool owns the element from here, registration included, so its
      // page changes with the claim rather than with a React render.
      audioRef.current = el;
      setHandoffAudio(handoffKey, claimRef.current, { el, source: null, analyser: null });
    } else {
      adoptAudioElement(el);
    }
    setAudioElVersion((v) => v + 1);
    return el;
  }, [audioUrl, adoptAudioElement, adoptGraph, handoffKey]);

  /**
   * Hold a claim for as long as this card is mounted. The feed card keeps its
   * claim while the post page is open — that is what the player drops back to
   * when the overlay closes — so releasing it is the unmount's job, never the
   * hand-over's.
   */
  useEffect(() => {
    if (!handoffKey || !surfaceActive) return;
    claimRef.current = claimHandoffAudio(handoffKey, () => canvasRef.current);
    const unsubscribe = subscribeHandoffAudio(handoffKey, () => setClaimVersion((v) => v + 1));
    setClaimVersion((v) => v + 1);
    return () => {
      unsubscribe();
      const token = claimRef.current;
      claimRef.current = null;
      audioRef.current = null;
      sourceRef.current = null;
      analyserRef.current = null;
      isConnectedRef.current = false;
      if (token) releaseHandoffAudio(handoffKey, token);
    };
  }, [handoffKey, surfaceActive]);

  // Taking the player over: pick the chain up, and tell the card that owns
  // `isPlaying` what it actually walked into.
  useLayoutEffect(() => {
    if (!handoffKey || !isActiveClaim || isPoppedOut) return;
    const graph = getHandoffAudio(handoffKey, claimRef.current);
    if (!graph) return;
    if (audioRef.current !== graph.el || sourceRef.current !== graph.source) adoptGraph(graph);
    const playing = !graph.el.paused;
    if (playing !== isPlayingRef.current) {
      adoptionPendingRef.current = playing;
      onPlaybackAdoptedRef.current?.(playing);
    }
    // Read once, at the moment the player changes hands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimVersion, isActiveClaim, isPoppedOut, handoffKey]);

  // Metadata is cheap; the full-file decode next door is not, so both ride the
  // same near-viewport gate.
  useEffect(() => {
    if (!decodeEnabled && !isPlaying) return;
    // The corner player has this track: a second element buys nothing.
    if (isPoppedOut) return;
    ensureAudioElement();
  }, [decodeEnabled, isPlaying, isPoppedOut, ensureAudioElement]);

  // Keep the scrubber in step with the element, however it got there.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => {
      if (isActiveClaimRef.current && decodeEnabled) setCurrentTime(el.currentTime);
    };
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
      if (isPoppedOutRef.current) return; // the corner player rests at the end
      if (!isActiveClaimRef.current) return; // the card holding the player owns the end
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
    onTime();
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('seeked', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('durationchange', onMeta);
      el.removeEventListener('ended', onEnded);
    };
  }, [audioElVersion, decodeEnabled]);

  useEffect(() => {
    setDuration((d) => (d > 0 ? d : durationHint));
  }, [durationHint]);

  const setupAudio = useCallback(() => {
    if (isConnectedRef.current) return;

    try {
      const el = ensureAudioElement();
      if (!el) return;

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
      // Hand the chain to the pool with the element: the card that takes the
      // player over must adopt this source, never build a second one.
      if (handoffKey) {
        setHandoffAudio(handoffKey, claimRef.current, {
          el,
          source: sourceRef.current,
          analyser: analyserRef.current,
        });
      }
    } catch (err) {
      console.error('Failed to setup audio:', err);
    }
  }, [ensureAudioElement, handoffKey]);

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
    // Paper flips the painters' lightness scale; see setVisualizerInk.
    setVisualizerInk(isLightTheme);
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
      // Default reads the analyser too now — it blooms out of the playhead —
      // but only while actually playing. The synthesised idle frame the other
      // styles fall back on would leave a frozen lump in the waveform on a
      // paused card, and this is the style people scrub against.
      let staticData = EMPTY_DATA;
      const staticAnalyser = analyserRef.current;
      if (staticAnalyser && isPlayingRef.current) {
        const freq = new Uint8Array(staticAnalyser.frequencyBinCount);
        staticAnalyser.getByteFrequencyData(freq);
        staticData = freq;
      }
      drawStatic(ctx, staticData, width, height, hue, seed, progress, peaksRef.current, STATIC_BAR_COUNT);
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

    if (isExtraStyle(style)) {
      const listener = (listenerRef.current ||= new AudioListener());
      const audio = audioRef.current;
      const played = audio && audio.duration ? audio.currentTime / audio.duration : 0;
      const progress = scrubRatioRef.current ?? played;
      const now = performance.now() / 1000;
      if (analyser && isPlayingRef.current) listener.fromAnalyser(frequencyData, timeData, now, progress, idleShape);
      else listener.hold(now, progress, idleShape);
      const cssW = canvas.clientWidth || width;
      const scale = width / cssW;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawExtra(style, ctx as never, width / scale, height / scale, listener.frame, makePalette(hue, isLightTheme, theme), extraStateRef.current as never);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      return;
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
      case 'orb':
        drawOrb(ctx, frequencyData, width, height, hue);
        break;
    }
  }, [style, hue, seed, idleFrequency, idleTime, idleShape, isLightTheme, theme]);

  const drawFrameRef = useRef(drawFrame);
  drawFrameRef.current = drawFrame;

  // ONE animation loop, started and stopped by isPlaying alone. It used to
  // restart on every `draw` identity change without cancelling the previous
  // frame, so changing style or dragging the hue slider mid-playback left a
  // second (then a third) rAF loop running against the same canvas.
  useEffect(() => {
    if (!isPlaying || !isActiveClaim || !decodeEnabled) {
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
  }, [isPlaying, isActiveClaim, decodeEnabled]);

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
    resetOrb();
    resetStatic();
    extraStateRef.current = {};
  }, [style]);

  /* ─── Playback ────────────────────────────────────────────────────────── */

  // Play/pause runs synchronously off the user gesture: setupAudio + play()
  // land in the same call-stack as the click, which is what the autoplay policy
  // checks.
  const handlePlayPause = useCallback(() => {
    if (isPoppedOutRef.current) {
      toggleAudioPost();
      return;
    }
    if (!isPlayingRef.current && !isConnectedRef.current) {
      setupAudio();
    }
    onPlayPauseRef.current();
  }, [setupAudio]);

  /**
   * Pop out — or dock back. Popping out hands the element and its analyser
   * chain over as they are (nothing reloads, nothing goes quiet), starts the
   * track if it was idle, and leaves fullscreen: a corner player you cannot
   * browse past is no corner player. Docking takes the same element back.
   */
  const handlePopOut = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!popoutTrack) return;
      if (isPoppedOutRef.current) {
        const graph = takeBackAudioPost(popoutTrack.tokenId);
        if (!graph) return;
        if (handoffKey) {
          audioRef.current = graph.el;
          setHandoffAudio(handoffKey, claimRef.current, graph);
        } else {
          adoptAudioElement(graph.el);
        }
        sourceRef.current = graph.source;
        analyserRef.current = graph.analyser;
        audioContextRef.current = graph.source ? sharedVisualizerContext : null;
        isConnectedRef.current = !!graph.source;
        handedOverRef.current = false;
        setAudioElVersion((v) => v + 1);
        onPopOutChange?.(false, !graph.el.paused);
        return;
      }
      if (isFullscreen && onFullscreen) onFullscreen(e);
      const el = audioRef.current;
      const wasPlaying = isPlayingRef.current;
      handedOverRef.current = !!el;
      // The corner player survives navigation on purpose — hand the page's
      // claim over with the element, or the next route change would pause it.
      // Same for the shared player: the pool must let go, not tear down.
      if (handoffKey) detachHandoffAudio(handoffKey);
      else releaseOffDocument();
      const startAt = pendingSeekRef.current ?? (duration > 0 ? currentTime / duration : null);
      pendingSeekRef.current = null;
      popOutAudioPost({
        track: {
          ...popoutTrack,
          title: popoutTrack.title || t('audioPost.untitled'),
          artist: popoutTrack.artist || t('audioPost.creator'),
        },
        graph: el ? { el, source: sourceRef.current, analyser: analyserRef.current } : null,
        startAt: el ? null : startAt,
      });
      onPopOutChange?.(true, wasPlaying);
    },
    [
      popoutTrack, isFullscreen, onFullscreen, onPopOutChange, duration, currentTime, t,
      adoptAudioElement, releaseOffDocument, handoffKey,
    ],
  );

  // The corner player closed on this track — its X, or something else took
  // the session — without handing the element back. Let go of it: the engine
  // has already paused it and dropped its source. The next play builds a fresh
  // element at the position the scrubber is showing.
  useEffect(() => {
    if (isPoppedOut || !handedOverRef.current) return;
    handedOverRef.current = false;
    const at = duration > 0 ? clamp01(currentTime / duration) : null;
    releaseOffDocument();
    audioRef.current = null;
    sourceRef.current = null;
    analyserRef.current = null;
    audioContextRef.current = null;
    isConnectedRef.current = false;
    pendingSeekRef.current = at !== null && at < 0.999 ? at : null;
    setAudioElVersion((v) => v + 1);
    // Keyed on the hand-back alone: the position is read once, at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPoppedOut]);

  // Separate effect for playback control — runs AFTER state update from parent
  useEffect(() => {
    if (!audioRef.current || isPoppedOut || !isActiveClaim) return;
    if (adoptionPendingRef.current !== null) {
      if (isPlaying !== adoptionPendingRef.current) return;
      adoptionPendingRef.current = null;
    }

    if (isPlaying) {
      audioRef.current.play().catch(console.error);
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, isPoppedOut, isActiveClaim, audioElVersion]);

  // Sync muted + volume. The caller's `muted` and the visualizer's own control
  // are OR'd rather than one overwriting the other: VideoCard mutes for its own
  // reasons, and a listener dragging this to zero should not be undone by an
  // unrelated re-render from the card.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !isActiveClaim) return;
    el.muted = muted || selfMuted;
    el.volume = volume;
  }, [muted, selfMuted, volume, isActiveClaim, audioElVersion]);

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
    if (!el) return;
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

  const bottomScrub = useVideoScrubZone({
    enabled: duration > 0,
    duration,
    onStart: cancelScrub,
    onPreview: time => setScrubRatio(time / duration),
    onCommit: time => seekTo(time / duration),
    onFinish: () => setScrubRatio(null),
    onCancel: cancelScrub,
    ignoreSelector: '[data-audio-style-picker]',
  });

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
      unregisterMediaRef.current?.();
      unregisterMediaRef.current = null;
      // A handed-over element and its nodes belong to the corner player now;
      // it carries on after this card is gone and tears them down itself.
      // A pooled one is the same story with a different owner: the claim
      // effect above released it, and lib/audio-handoff hands it back down to
      // the feed card or parks it. Tearing it down here would stop the track
      // the moment you closed the post you opened it from.
      if (!handedOverRef.current && !handoffKeyRef.current) {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.removeAttribute('src');
        }
        // Detach this card's nodes from the SHARED context (never close it —
        // other visualizers may be using it).
        sourceRef.current?.disconnect();
        analyserRef.current?.disconnect();
      }
      audioRef.current = null;
      sourceRef.current = null;
      analyserRef.current = null;
      audioContextRef.current = null;
      isConnectedRef.current = false;
      resetSpectrum();
      resetRings();
      resetPulse();
      resetTerrain();
      resetOrb();
      resetStatic();
    };
  }, []);

  const playedRatio = duration > 0 ? clamp01(currentTime / duration) : 0;
  const displayRatio = scrubRatio ?? playedRatio;
  const displayTime = scrubRatio !== null ? scrubRatio * duration : currentTime;
  const isEffectivelyMuted = muted || selfMuted || volume === 0;
  const glassShadow = isLightTheme
    ? 'shadow-[0_2px_8px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.15)]'
    : 'shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.3)]';

  const stopBubble = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div data-no-swipe data-video-controls data-audio-player className={`relative ${className}`} {...bottomScrub}>
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

      {/* Normally beside volume; the first feed post clears the nav capsule. */}
      <div
        data-audio-colour
        data-audio-fullscreen={isFullscreen || undefined}
        className={cn('absolute top-2 z-20 pointer-events-none', showVolume ? 'right-[110px]' : 'right-2')}
      >
        {/* Colour slider matches the unframed volume slider. */}
        {showStylePicker && (
                <div
          className={cn('pointer-events-auto shrink-0 flex items-center px-1', CONTROL_H)}
          style={{ '--hue-thumb': hue === 0 ? 'hsl(0, 0%, 100%)' : `hsl(${hue}, 80%, 60%)` } as React.CSSProperties}
          onClick={stopBubble}
          onPointerDown={stopBubble}
        >
          {/* No overflow-hidden: the 12px thumb lives in a 6px track, so
              clipping to the track cut the grab handle in half — which is
              exactly what you see the moment you drag it. The gradient is
              a background, and border-radius clips that on its own. */}
          <div className="relative w-14 h-1.5 rounded-full" style={{ background: HUE_GRADIENT }}>
            <Slider
              value={[hue]}
              min={0}
              max={360}
              step={1}
              onValueChange={(value) => setHue(value[0])}
              aria-label="Visualizer colour"
              /* Root overflows the track vertically so the grab area is
                 26px rather than 6px. Targets Slider's own data-* hooks —
                 the old [class*=Track] selectors matched nothing, since
                 those are utility classes, not component names. */
              className={cn(
                'absolute -inset-y-2.5 inset-x-0 w-full py-0',
                '[&_[data-slider-track]]:bg-transparent [&_[data-slider-range]]:bg-transparent',
                '[&_[data-slider-thumb]]:h-3 [&_[data-slider-thumb]]:w-3',
                '[&_[data-slider-thumb]]:border-2 [&_[data-slider-thumb]]:border-white',
                '[&_[data-slider-thumb]]:bg-[var(--hue-thumb)]',
                '[&_[data-slider-thumb]]:shadow-[0_1px_4px_rgba(0,0,0,0.45)]',
              )}
            />
          </div>
        </div>
        )}


      </div>

      <div className="absolute right-2 top-2 z-20 pointer-events-auto">
              {showVolume && (
              <div
                className={cn('shrink-0 flex items-center gap-1.5 px-1', CONTROL_H)}
                onClick={stopBubble}
                onPointerDown={stopBubble}
              >
                <button
                  type="button"
                  data-on-media
                  data-audio-bare
                  aria-label={isEffectivelyMuted ? 'Unmute' : 'Mute'}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isEffectivelyMuted) { setSelfMuted(true); videoPlaybackManager.globalMuted = true; onMuteChange?.(true); return; }
                    setSelfMuted(false);
                    videoPlaybackManager.globalMuted = false;
                    onMuteChange?.(false);
                    // Unmuting a slider dragged to zero has to put the level back,
                    // or the icon flips and the track stays silent.
                    if (volume === 0) setVolume(0.8);
                  }}
                  className="shrink-0 w-8 h-8 flex items-center justify-center text-white/80 hover:text-white transition-colors"
                >
                  <MediaControlIcon icon={isEffectivelyMuted ? VolumeX : Volume2} />
                </button>
                {/* The fill is Slider's own Range, not a div sized to the value:
                    Radix insets the thumb by half its width so it never overhangs the
                    track, so a hand-painted fill and the thumb drift apart at both
                    ends. The Track clips the Range for us and leaves the thumb alone
                    — it is a sibling, not a child. */}
                <div className="relative w-12 h-1.5">
                  <Slider
                    value={[isEffectivelyMuted ? 0 : Math.round(volume * 100)]}
                    min={0}
                    max={100}
                    step={1}
                    aria-label="Volume"
                    onValueChange={(value) => {
                      setVolume(value[0] / 100);
                      setSelfMuted(value[0] === 0);
                      videoPlaybackManager.globalMuted = value[0] === 0;
                      onMuteChange?.(value[0] === 0);
                    }}
                    className={cn(
                      'absolute -inset-y-2.5 inset-x-0 w-full py-0',
                      '[&_[data-slider-track]]:bg-white/25 [&_[data-slider-range]]:bg-white/85',
                      '[&_[data-slider-thumb]]:h-3 [&_[data-slider-thumb]]:w-3',
                      '[&_[data-slider-thumb]]:border-2 [&_[data-slider-thumb]]:border-white',
                      '[&_[data-slider-thumb]]:bg-white',
                      '[&_[data-slider-thumb]]:shadow-[0_1px_4px_rgba(0,0,0,0.45)]',
                    )}
                  />
                </div>
              </div>
              )}
      </div>

      {/* Controls. There is no centre overlay any more: the play button used to
          sit invisibly in the middle of the canvas and appear on hover, so a
          mouse anywhere near the card flashed a pause button, and the
          invisible-but-clickable box swallowed every press aimed at the
          waveform underneath it. */}
      <div data-audio-controls className="absolute inset-x-0 bottom-0 z-20 pointer-events-none">
        <div data-audio-scrub-surface className="absolute inset-x-0 bottom-0 h-16 touch-none pointer-events-auto" />
        {/* Video-style play/countdown and tools above the edge scrubber.
            The style picker gives up width and scrolls before buttons clip. */}
        <div
          data-audio-button-row
          className="relative flex items-center gap-2 px-1.5 pb-1.5 pointer-events-none"
          // pan-y too: this bar spans the card, so a feed swipe that starts on
          // it has to scroll the page. The style row still pans sideways.
          style={{ touchAction: 'pan-x pan-y' }}
          onClick={stopBubble}
          onPointerDown={stopBubble}
        >
          <button
            type="button"
            data-on-media
            data-audio-bare
            aria-label={isPlaying ? 'Pause' : 'Play'}
            onClick={(e) => { e.stopPropagation(); handlePlayPause(); }}
            className={cn(
              'pointer-events-auto shrink-0 w-8 flex items-center justify-center transition-colors',
              CONTROL_H,
              'text-white hover:opacity-80',
            )}
          >
            <MediaControlIcon icon={isPlaying ? Pause : Play} />
          </button>

          <span data-audio-bare className="min-w-[36px] text-center text-xs font-medium tabular-nums text-white">
            {formatTime(Math.max(0, Math.ceil(duration - displayTime)))}
          </span>
          {showStylePicker && (
            <>
              {/* Style picker - scrolls when the card is too narrow for all
                  presets, masked at whichever edge is actually hiding one so a
                  half-chip dissolves instead of being sliced. */}
              {showStylePicker && (
              <div
                ref={chipScrollRef}
                data-no-swipe
                data-audio-style-picker
                className="pointer-events-auto flex-1 min-w-0 overflow-x-auto overscroll-x-contain scrollbar-none"
                style={chipFadeStyle}
                onTouchStart={stopBubble}
              >
                <div className="flex gap-1 w-max">
                  {STYLES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      data-on-media
                      data-audio-style
                      data-keep-round
                      data-active={style === s.value || undefined}
                      aria-pressed={style === s.value}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setStyle(s.value);
                      }}
                      onPointerDown={stopBubble}
                      onTouchStart={stopBubble}
                      className={cn(
                        // Faint dark backing so labels stay readable over white-heavy themes.
                        'relative inline-flex items-center px-2 text-[10px] font-medium rounded-full overflow-hidden whitespace-nowrap transition-colors text-white/75 hover:text-white bg-black/25',
                        CONTROL_H,
                      )}
                    >
                      {style === s.value && (
                        <div
                          data-audio-style-active
                          data-keep-round
                          className={cn('absolute inset-0 rounded-full', GLASS_PILL, glassShadow)}
                        />
                      )}
                      <span className={`relative z-10 ${style === s.value ? 'text-white' : ''}`}>{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              )}
            </>
          )}
        {popoutTrack && (
          <button
            type="button"
            data-on-media
            data-audio-bare
            aria-label={isPoppedOut ? t('audioPost.closeCornerPlayer') : t('audioPost.popOut')}
            title={isPoppedOut ? t('audioPost.closeCornerPlayer') : t('audioPost.popOut')}
            aria-pressed={isPoppedOut}
            onClick={handlePopOut}
            onPointerDown={stopBubble}
            className={cn(
              'pointer-events-auto shrink-0 w-8 flex items-center justify-center transition-colors',
              CONTROL_H,
              isPoppedOut
                ? 'opacity-100'
                : 'opacity-80 hover:opacity-100',
            )}
          >
            <MediaControlIcon icon={PictureInPicture2} />
          </button>
        )}

        {onFullscreen && (
          <button
            type="button"
            data-on-media
            data-audio-bare
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            onClick={(e) => { e.stopPropagation(); onFullscreen(e); }}
            onPointerDown={stopBubble}
            className={cn(
              'pointer-events-auto shrink-0 w-8 flex items-center justify-center transition-colors',
              CONTROL_H,
              'text-white hover:opacity-80',
            )}
          >
            <MediaControlIcon icon={isFullscreen ? Minimize : Maximize} />
          </button>
        )}
        </div>
          <div
            data-scrub-track
            role="slider"
            tabIndex={0}
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.max(0, Math.round(duration))}
            aria-valuenow={Math.max(0, Math.round(displayTime))}
            aria-valuetext={`${formatTime(displayTime)} of ${formatTime(duration)}`}
            className="absolute inset-x-0 bottom-0 h-3.5 cursor-pointer outline-none pointer-events-auto focus-visible:ring-2 focus-visible:ring-white"
            style={{ touchAction: 'none' }}
            onKeyDown={handleSeekKeyDown}
          >
            <div className="absolute inset-x-0 bottom-0 h-[3px] border-[0.5px] border-black/65 bg-white/30" />
            <div
              className="absolute bottom-[0.5px] left-[0.5px] h-[2px] bg-white"
              style={{ width: `${displayRatio * 100}%` }}
            />
          </div>
      </div>
    </div>
  );
}
