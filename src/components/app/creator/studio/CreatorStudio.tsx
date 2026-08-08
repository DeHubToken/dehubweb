/**
 * Creator Studio.
 * ===============
 * The generation workspace at the top of /creator. Before this, every tool on
 * the page navigated away to the assistant chat, so nothing could actually be
 * made on /creator. Now the composer is the page: pick a mode, pick a preset,
 * type a subject, generate, and the result is one click from the timeline.
 *
 * Payment is unchanged. Generate opens the existing DHB paywall for the chosen
 * model and the job only starts once the transfer confirms.
 *
 * ── Three workspaces, not one ───────────────────────────────────────────────
 * Image, video and 3D each keep their own prompt, preset, attachment, model and
 * settings, and the whole lot is written to localStorage. Switching modes is
 * therefore free: a half-written video brief survives a detour into image, and
 * survives a reload. Only large attachments are dropped from the cache — see
 * `persistableReference`.
 *
 * ── The composer follows you down the page ──────────────────────────────────
 * Once it would scroll under the page header it sticks there and shrinks to a
 * single line — text box, mode toggle, buttons. Clicking into it opens it back
 * up to full size; clicking away, or scrolling back to the top, closes it again.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Film,
  ImageIcon,
  Loader2,
  Music2,
  Paperclip,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import {
  IMAGE_MODELS,
  IMAGE_MODEL_OPTIONS,
  getImageCostUsd,
  imageModelSupportsEdit,
  type ImageModelKey,
} from '@/constants/image-models.constants';
import {
  VIDEO_MODELS,
  VIDEO_MODEL_OPTIONS,
  getVideoCostUsd,
  getVideoResolutions,
  snapVideoDuration,
  type VideoModelKey,
} from '@/constants/video-models.constants';
import {
  MODEL3D_MODELS,
  MODEL3D_MODEL_OPTIONS,
  getModel3dCostUsd,
  type Model3dModelKey,
} from '@/constants/model3d-models.constants';
import { ImagePaywallModal } from '@/components/app/image/ImagePaywallModal';
import {
  VideoPaywallModal,
  type VideoGenerationOptions,
} from '@/components/app/video/VideoPaywallModal';
import {
  Model3dPaywallModal,
  type Model3dGenerationOptions,
} from '@/components/app/model3d/Model3dPaywallModal';
import { AudioPaywallModal } from '@/components/app/audio/AudioPaywallModal';
import {
  AUDIO_LANGUAGES,
  AUDIO_TASKS,
  AUDIO_TASK_OPTIONS,
  DEFAULT_VOICE_SETTINGS,
  MAX_AUDIO_UPLOAD_BYTES,
  MAX_SPEECH_CHARS,
  MUSIC_DEFAULT_SECONDS,
  MUSIC_MAX_SECONDS,
  MUSIC_MIN_SECONDS,
  SFX_AUTO_DURATION,
  SFX_MAX_SECONDS,
  TTS_MODELS,
  TTS_MODEL_OPTIONS,
  billableUnits,
  getAudioCostUsd,
  isAudioTask,
  type AudioTask,
  type TtsModelKey,
} from '@/constants/audio-models.constants';
import { applyPreset, getPreset, type CreatorPreset } from '@/lib/creator/presets';
import {
  DEFAULT_VOICE_ID,
  enhancePrompt,
  hostDataUrl,
  type AudioRequest,
} from '@/lib/creator/generationEngine';
import { useGenerationStore, type GenerationJob } from '@/store/generationStore';
import { useCloseOnSurfaceSwitch, useSurfaceEpoch } from '@/hooks/use-surface-switch';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';
import { CounterChip, SelectChip, ToggleChip, type ChipOption } from './StudioChip';
import { PresetStrip } from './PresetStrip';
import { ResultsFeed } from './ResultsFeed';
import { VoiceDesignDrawer } from './VoiceDesignDrawer';
import { StudioVoicePicker } from './StudioVoicePicker';

type Mode = 'image' | 'video' | 'audio' | '3d';
type Resolution = '480p' | '720p' | '1080p';
type Reference = { url: string; label: string } | null;
type ByMode<T> = Record<Mode, T>;

const IMAGE_ASPECTS = ['1:1', '4:5', '16:9', '9:16', '3:2', '2:3', '21:9'] as const;
const MAX_IMAGE_BATCH = 4;
const MAX_REFERENCE_BYTES = 20 * 1024 * 1024;

/**
 * A mesh has no aspect ratio, but the results feed sizes every card from one.
 * Square is the honest choice for a turntable preview.
 */
const MODEL3D_ASPECT = '1:1';

/** Audio has no framing either, and the results grid still needs one per card. */
const AUDIO_ASPECT = '1:1';

const MODES: { id: Mode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'image', label: 'Image', icon: ImageIcon },
  { id: 'video', label: 'Video', icon: Film },
  { id: 'audio', label: 'Audio', icon: Music2 },
  { id: '3d', label: '3D', icon: Box },
];

// ─── Cached workspace state ─────────────────────────────────────────────────

const STORAGE_KEY = 'dehub:creator-studio:v1';

/**
 * Attachments above this are kept in memory but left out of the cache.
 *
 * References are data URLs until the moment they are needed as a hosted file,
 * and a 20 MB one would blow the whole localStorage budget — taking the prompts
 * and model choices down with it. Three modes at this ceiling still fits.
 */
const MAX_PERSISTED_REFERENCE_BYTES = 512 * 1024;

interface StudioSnapshot {
  mode: Mode;
  prompts: ByMode<string>;
  presetIds: ByMode<string | null>;
  references: ByMode<Reference>;
  imageModel: ImageModelKey;
  videoModel: VideoModelKey;
  model3dModel: Model3dModelKey;
  imageAspect: string;
  videoAspect: string;
  batch: number;
  duration: number;
  resolution: Resolution;
  audioTask: AudioTask;
  ttsModel: TtsModelKey;
  voiceId: string;
  /** Stability / similarity / style / speed, as chosen on the voice chips. */
  stability: number;
  similarity: number;
  style: number;
  speed: number;
  musicSeconds: number;
  instrumental: boolean;
  sfxSeconds: number;
  promptInfluence: number;
  loopSfx: boolean;
  dubTargetLang: string;
  /** Speech language override. Empty means let the model infer it. */
  speechLang: string;
}

const DEFAULT_SNAPSHOT: StudioSnapshot = {
  mode: 'video',
  prompts: { image: '', video: '', audio: '', '3d': '' },
  presetIds: { image: null, video: null, audio: null, '3d': null },
  references: { image: null, video: null, audio: null, '3d': null },
  imageModel: 'gemini-3-pro-image',
  videoModel: 'seedance-2.5',
  model3dModel: 'tripo-2.5',
  imageAspect: '1:1',
  videoAspect: '16:9',
  batch: 1,
  duration: 5,
  resolution: '720p',
  audioTask: 'speech',
  ttsModel: 'eleven_multilingual_v2',
  voiceId: DEFAULT_VOICE_ID,
  stability: DEFAULT_VOICE_SETTINGS.stability,
  similarity: DEFAULT_VOICE_SETTINGS.similarity,
  style: DEFAULT_VOICE_SETTINGS.style,
  speed: DEFAULT_VOICE_SETTINGS.speed,
  musicSeconds: MUSIC_DEFAULT_SECONDS,
  instrumental: true,
  sfxSeconds: SFX_AUTO_DURATION,
  promptInfluence: 0.3,
  loopSfx: false,
  dubTargetLang: 'es',
  speechLang: '',
};

/** A reference small enough to be worth writing to localStorage. */
function persistableReference(ref: Reference): Reference {
  if (!ref) return null;
  // Hosted references cost nothing to keep — it is the inline data URLs that
  // are large.
  if (!ref.url.startsWith('data:')) return ref;
  return ref.url.length <= MAX_PERSISTED_REFERENCE_BYTES ? ref : null;
}

function isMode(v: unknown): v is Mode {
  return v === 'image' || v === 'video' || v === 'audio' || v === '3d';
}

/** Restore the cached workspace, discarding anything that no longer type-checks. */
function readSnapshot(): StudioSnapshot {
  if (typeof window === 'undefined') return DEFAULT_SNAPSHOT;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private-mode Safari throws on read as well as write.
    return DEFAULT_SNAPSHOT;
  }
  if (!raw) return DEFAULT_SNAPSHOT;

  try {
    const saved = JSON.parse(raw) as Partial<StudioSnapshot>;
    const byMode = <T,>(v: unknown, fallback: ByMode<T>): ByMode<T> => {
      if (!v || typeof v !== 'object') return fallback;
      const o = v as Partial<ByMode<T>>;
      return {
        image: o.image ?? fallback.image,
        video: o.video ?? fallback.video,
        audio: o.audio ?? fallback.audio,
        '3d': o['3d'] ?? fallback['3d'],
      };
    };
    /** Clamp a cached number back into range; a stale one out of range is junk. */
    const clamp = (v: unknown, min: number, max: number, fallback: number): number =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
    // A model that has since been retired from the catalogue must not come
    // back as a selection — every downstream price and guardrail reads it.
    const pick = <T extends string>(v: unknown, registry: Record<string, unknown>, fallback: T): T =>
      typeof v === 'string' && v in registry ? (v as T) : fallback;

    return {
      mode: isMode(saved.mode) ? saved.mode : DEFAULT_SNAPSHOT.mode,
      prompts: byMode(saved.prompts, DEFAULT_SNAPSHOT.prompts),
      presetIds: byMode(saved.presetIds, DEFAULT_SNAPSHOT.presetIds),
      references: byMode(saved.references, DEFAULT_SNAPSHOT.references),
      imageModel: pick(saved.imageModel, IMAGE_MODELS, DEFAULT_SNAPSHOT.imageModel),
      videoModel: pick(saved.videoModel, VIDEO_MODELS, DEFAULT_SNAPSHOT.videoModel),
      model3dModel: pick(saved.model3dModel, MODEL3D_MODELS, DEFAULT_SNAPSHOT.model3dModel),
      imageAspect: typeof saved.imageAspect === 'string' ? saved.imageAspect : DEFAULT_SNAPSHOT.imageAspect,
      videoAspect: typeof saved.videoAspect === 'string' ? saved.videoAspect : DEFAULT_SNAPSHOT.videoAspect,
      batch:
        typeof saved.batch === 'number'
          ? Math.min(MAX_IMAGE_BATCH, Math.max(1, Math.round(saved.batch)))
          : DEFAULT_SNAPSHOT.batch,
      duration: typeof saved.duration === 'number' ? saved.duration : DEFAULT_SNAPSHOT.duration,
      resolution:
        saved.resolution === '480p' || saved.resolution === '720p' || saved.resolution === '1080p'
          ? saved.resolution
          : DEFAULT_SNAPSHOT.resolution,
      audioTask: isAudioTask(saved.audioTask) ? saved.audioTask : DEFAULT_SNAPSHOT.audioTask,
      ttsModel: pick(saved.ttsModel, TTS_MODELS, DEFAULT_SNAPSHOT.ttsModel),
      // Not validated against the voice library: it is fetched asynchronously
      // and a cloned voice the creator made is just as legitimate as a stock
      // one. A voice that has since been deleted fails loudly at generation
      // rather than being silently swapped for someone else's.
      voiceId: typeof saved.voiceId === 'string' && saved.voiceId ? saved.voiceId : DEFAULT_SNAPSHOT.voiceId,
      stability: clamp(saved.stability, 0, 1, DEFAULT_SNAPSHOT.stability),
      similarity: clamp(saved.similarity, 0, 1, DEFAULT_SNAPSHOT.similarity),
      style: clamp(saved.style, 0, 1, DEFAULT_SNAPSHOT.style),
      speed: clamp(saved.speed, 0.7, 1.2, DEFAULT_SNAPSHOT.speed),
      musicSeconds: clamp(
        saved.musicSeconds,
        MUSIC_MIN_SECONDS,
        MUSIC_MAX_SECONDS,
        DEFAULT_SNAPSHOT.musicSeconds,
      ),
      instrumental: typeof saved.instrumental === 'boolean' ? saved.instrumental : DEFAULT_SNAPSHOT.instrumental,
      // 0 is meaningful here — it is "let the model choose" — so the floor is 0
      // rather than the provider's half-second minimum.
      sfxSeconds: clamp(saved.sfxSeconds, 0, SFX_MAX_SECONDS, DEFAULT_SNAPSHOT.sfxSeconds),
      promptInfluence: clamp(saved.promptInfluence, 0, 1, DEFAULT_SNAPSHOT.promptInfluence),
      loopSfx: typeof saved.loopSfx === 'boolean' ? saved.loopSfx : DEFAULT_SNAPSHOT.loopSfx,
      dubTargetLang:
        typeof saved.dubTargetLang === 'string' && saved.dubTargetLang
          ? saved.dubTargetLang
          : DEFAULT_SNAPSHOT.dubTargetLang,
      speechLang: typeof saved.speechLang === 'string' ? saved.speechLang : DEFAULT_SNAPSHOT.speechLang,
    };
  } catch {
    return DEFAULT_SNAPSHOT;
  }
}

/**
 * Read the playable length of an upload, for the two tasks billed per minute.
 *
 * Resolves to null rather than rejecting when the browser cannot decode it —
 * an exotic container is not a reason to block a generation, and
 * `billableUnits` treats an unknown length as one minute, which is the smallest
 * honest guess rather than a free pass.
 */
function readMediaDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement('video');
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      const seconds = el.duration;
      done(Number.isFinite(seconds) && seconds > 0 ? seconds : null);
    };
    el.onerror = () => done(null);
    el.src = url;
    // A file that never fires either event would leave Generate stuck behind a
    // promise that never settles.
    setTimeout(() => done(null), 10_000);
  });
}

/**
 * Turn a written scene into the per-line input the dialogue endpoint takes.
 *
 * The format is "Name: line", one speaker per line, which is how anybody
 * already writes a script — so there is nothing to learn and no separate
 * speaker-assignment UI to fill in first.
 *
 * Names map to voices by ORDER of first appearance, not by identity: the first
 * distinct speaker gets the chosen voice and the rest fall to the stock cast
 * below. Round-robin over a fixed list is what makes a two-hander sound like
 * two people without asking anyone to paste voice ids in.
 *
 * A line with no "Name:" prefix is not dropped — it continues the speaker who
 * last spoke, which is what a wrapped paragraph in a pasted script means.
 */
const DIALOGUE_CAST = [
  '9BWtsMINqrJLrRacOk9x', // Aria
  'CwhRBWXzGAHq8TQ4Fs17', // Roger
  'EXAVITQu4vr4xnSDxMaL', // Sarah
  'FGY2WhTYpPnrIDTdsKH5', // Laura
  'IKne3meq5aSn9XLyUdCD', // Charlie
  'JBFqnCBsd6RMkjVDRZzb', // George
];

function parseDialogue(script: string, primaryVoiceId: string): { text: string; voiceId: string }[] {
  const lines = script.split('\n').map((l) => l.trim()).filter(Boolean);
  const voiceByName = new Map<string, string>();
  const out: { text: string; voiceId: string }[] = [];

  for (const line of lines) {
    // A colon inside the spoken line itself must not be read as a speaker, so
    // the name is bounded: no colons, and short enough to be a name.
    const match = line.match(/^([^:]{1,32}):\s*(.+)$/);
    if (!match) {
      if (out.length) out[out.length - 1].text += ` ${line}`;
      continue;
    }
    const [, rawName, text] = match;
    const name = rawName.trim().toLowerCase();
    if (!voiceByName.has(name)) {
      // The first speaker gets the voice actually chosen on the chip; the rest
      // take the stock cast, skipping it so nobody is doubled up.
      const next =
        voiceByName.size === 0
          ? primaryVoiceId
          : DIALOGUE_CAST.filter((v) => v !== primaryVoiceId)[
              (voiceByName.size - 1) % Math.max(1, DIALOGUE_CAST.filter((v) => v !== primaryVoiceId).length)
            ];
      voiceByName.set(name, next || primaryVoiceId);
    }
    out.push({ text, voiceId: voiceByName.get(name) as string });
  }

  return out;
}

/** Read a picked file as a data URL for the reference-image channel. */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.readAsDataURL(file);
  });
}

/** Image / Video / 3D, as a segmented control small enough to live in the bar. */
function ModeToggle({
  mode,
  onChange,
  compact,
}: {
  mode: Mode;
  onChange: (next: Mode) => void;
  compact?: boolean;
}) {
  return (
    // Toggle buttons, not ARIA tabs: there is no tabpanel to control and no
    // arrow-key navigation, so aria-pressed is the honest semantic.
    <div
      role="group"
      aria-label="What to create"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-white/20 bg-white/10 p-0.5 backdrop-blur-xl"
    >
      {MODES.map((m) => {
        const Icon = m.icon;
        const active = mode === m.id;
        return (
          <button
            key={m.id}
            type="button"
            aria-pressed={active}
            aria-label={m.label}
            title={m.label}
            onClick={() => onChange(m.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
              compact ? 'px-2 py-1.5' : 'px-2.5 py-1.5',
              active ? 'bg-white text-black' : 'text-white/60 hover:bg-white/10 hover:text-white',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {!compact && <span className="hidden sm:inline">{m.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

interface CreatorStudioProps {
  /** Switches the host to /editor after a result is sent to the timeline. */
  onOpenEditor: () => void;
  /**
   * Height of the page's own sticky header, in px. The composer parks directly
   * underneath it, and collapses at exactly the point it would slide beneath.
   */
  stickyTop?: number;
}

export function CreatorStudio({ onOpenEditor, stickyTop = 60 }: CreatorStudioProps) {
  const { walletAddress, isAuthenticated } = useAuth() as {
    walletAddress: string | null;
    isAuthenticated: boolean;
  };

  const startImage = useGenerationStore((s) => s.startImage);
  const startVideo = useGenerationStore((s) => s.startVideo);
  const startModel3d = useGenerationStore((s) => s.startModel3d);
  const startAudio = useGenerationStore((s) => s.startAudio);
  const runningCount = useGenerationStore((s) => s.jobs.filter((j) => j.status === 'running').length);

  // One read of the cache, on mount, shared by every slice below.
  const [restored] = useState(readSnapshot);

  const [mode, setMode] = useState<Mode>(restored.mode);

  /** Per-mode workspaces. Switching modes must never discard the other two. */
  const [prompts, setPrompts] = useState<ByMode<string>>(restored.prompts);
  const [presetIds, setPresetIds] = useState<ByMode<string | null>>(restored.presetIds);
  const [references, setReferences] = useState<ByMode<Reference>>(restored.references);

  const [imageModel, setImageModel] = useState<ImageModelKey>(restored.imageModel);
  const [videoModel, setVideoModel] = useState<VideoModelKey>(restored.videoModel);
  const [model3dModel, setModel3dModel] = useState<Model3dModelKey>(restored.model3dModel);
  const [imageAspect, setImageAspect] = useState<string>(restored.imageAspect);
  const [videoAspect, setVideoAspect] = useState<string>(restored.videoAspect);
  const [batch, setBatch] = useState(restored.batch);
  const [duration, setDuration] = useState(restored.duration);
  const [resolution, setResolution] = useState<Resolution>(restored.resolution);

  // ── Audio workspace ───────────────────────────────────────────────────────
  const [audioTask, setAudioTask] = useState<AudioTask>(restored.audioTask);
  const [ttsModel, setTtsModel] = useState<TtsModelKey>(restored.ttsModel);
  const [voiceId, setVoiceId] = useState<string>(restored.voiceId);
  const [stability, setStability] = useState(restored.stability);
  const [similarity, setSimilarity] = useState(restored.similarity);
  const [style, setStyle] = useState(restored.style);
  const [speed, setSpeed] = useState(restored.speed);
  const [musicSeconds, setMusicSeconds] = useState(restored.musicSeconds);
  const [instrumental, setInstrumental] = useState(restored.instrumental);
  const [sfxSeconds, setSfxSeconds] = useState(restored.sfxSeconds);
  const [promptInfluence, setPromptInfluence] = useState(restored.promptInfluence);
  const [loopSfx, setLoopSfx] = useState(restored.loopSfx);
  const [dubTargetLang, setDubTargetLang] = useState(restored.dubTargetLang);
  const [speechLang, setSpeechLang] = useState(restored.speechLang);
  const [voiceDesignOpen, setVoiceDesignOpen] = useState(false);
  const [audioPaywallOpen, setAudioPaywallOpen] = useState(false);
  /**
   * The upload the four transformation tasks work from.
   *
   * Deliberately NOT in the snapshot: a File cannot be serialised, and the
   * reference channel next to it holds data URLs for images only. Losing the
   * attachment on reload is the honest outcome — the alternative is a composer
   * that says a file is attached when nothing is.
   */
  const [audioFile, setAudioFile] = useState<{ file: File; seconds: number | null } | null>(null);

  const activeAudioTask = AUDIO_TASKS[audioTask];

  const prompt = prompts[mode];
  const presetId = presetIds[mode];
  const reference = references[mode];

  // The casts are for the computed `[m]` key: with a union-typed key TypeScript
  // widens the spread rather than keeping the three-slot record.
  const setPromptFor = useCallback((m: Mode, value: string) => {
    setPrompts((p) => ({ ...p, [m]: value }) as ByMode<string>);
  }, []);
  const setPresetFor = useCallback((m: Mode, value: string | null) => {
    setPresetIds((p) => ({ ...p, [m]: value }) as ByMode<string | null>);
  }, []);
  const setReferenceFor = useCallback((m: Mode, value: Reference) => {
    setReferences((p) => ({ ...p, [m]: value }) as ByMode<Reference>);
  }, []);

  const setPrompt = useCallback((value: string) => setPromptFor(mode, value), [mode, setPromptFor]);
  const setPresetId = useCallback(
    (value: string | null) => setPresetFor(mode, value),
    [mode, setPresetFor],
  );
  const setReference = useCallback(
    (value: Reference) => setReferenceFor(mode, value),
    [mode, setReferenceFor],
  );

  const [imagePaywallOpen, setImagePaywallOpen] = useState(false);
  const [videoPaywallOpen, setVideoPaywallOpen] = useState(false);
  const [model3dPaywallOpen, setModel3dPaywallOpen] = useState(false);
  const [attaching, setAttaching] = useState(false);
  /** Hosting a 3D reference in storage, before the paywall opens. */
  const [staging, setStaging] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  /** Pre-enhance text, so the wand is always undoable. Per mode, like the text. */
  const [beforeEnhance, setBeforeEnhance] = useState<ByMode<string | null>>({
    image: null,
    video: null,
    audio: null,
    '3d': null,
  });

  /** Scrolled far enough that the composer is parked under the page header. */
  const [stuck, setStuck] = useState(false);
  /** The creator has clicked into the parked composer, so keep it open. */
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const collapsed = stuck && !pinnedOpen;

  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const studioTailRef = useRef<HTMLElement>(null);

  /**
   * Swallow: the preset strip and results feed are cut off at the composer's
   * top edge as they scroll under it, tracing its rounded corners and then
   * running full width just below them — the same treatment the home feed gets
   * from its nav pill. Without it the feed slides behind the glass and
   * re-emerges in the gutters either side of the bar.
   *
   * `allThemes` because /creator is a standalone dark surface rather than one
   * of the app's glass themes, so the hook's theme gate would never open.
   */
  useFeedSwallowClip(studioTailRef, '[data-creator-composer]', [], { allThemes: true });

  // Paywalls are Radix dialogs, portalled outside the host's hidden wrapper.
  useCloseOnSurfaceSwitch(
    useCallback(() => {
      setImagePaywallOpen(false);
      setVideoPaywallOpen(false);
      setModel3dPaywallOpen(false);
      setAudioPaywallOpen(false);
      setVoiceDesignOpen(false);
    }, []),
  );
  const surfaceEpoch = useSurfaceEpoch();

  const preset = getPreset(presetId);
  const activeVideoModel = VIDEO_MODELS[videoModel];
  const activeImageModel = IMAGE_MODELS[imageModel];
  const activeModel3d = MODEL3D_MODELS[model3dModel];

  /** Video models differ on what they accept; the rail follows the chosen one. */
  const videoAspects = activeVideoModel?.aspectRatios ?? ['16:9', '9:16', '1:1'];
  const videoResolutions = getVideoResolutions(activeVideoModel);

  // ── Cache the workspace ───────────────────────────────────────────────────
  useEffect(() => {
    const snapshot: StudioSnapshot = {
      mode,
      prompts,
      presetIds,
      references: {
        image: persistableReference(references.image),
        video: persistableReference(references.video),
        // Audio's attachment is a File held outside this record, so its
        // reference slot is always empty. Kept for the shape.
        audio: null,
        '3d': persistableReference(references['3d']),
      },
      imageModel,
      videoModel,
      model3dModel,
      imageAspect,
      videoAspect,
      batch,
      duration,
      resolution,
      audioTask,
      ttsModel,
      voiceId,
      stability,
      similarity,
      style,
      speed,
      musicSeconds,
      instrumental,
      sfxSeconds,
      promptInfluence,
      loopSfx,
      dubTargetLang,
      speechLang,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Over quota or storage disabled. The workspace still works for this
      // session; it just will not survive a reload.
    }
  }, [
    mode,
    prompts,
    presetIds,
    references,
    imageModel,
    videoModel,
    model3dModel,
    imageAspect,
    videoAspect,
    batch,
    duration,
    resolution,
    audioTask,
    ttsModel,
    voiceId,
    stability,
    similarity,
    style,
    speed,
    musicSeconds,
    instrumental,
    sfxSeconds,
    promptInfluence,
    loopSfx,
    dubTargetLang,
    speechLang,
  ]);

  // ── Sticky composer ───────────────────────────────────────────────────────

  // A one-pixel marker sits where the composer starts in normal flow. The
  // negative top margin on the observer's root is the page header, so the
  // switch fires at the moment the composer would slide underneath it.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting),
      { rootMargin: `-${Math.round(stickyTop) + 4}px 0px 0px 0px`, threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [stickyTop]);

  // Back at the top of the page the composer is full size anyway, so drop the
  // pin — otherwise it would re-open on its own the next time you scroll down.
  useEffect(() => {
    if (!stuck) setPinnedOpen(false);
  }, [stuck]);

  const openComposer = useCallback(() => {
    setPinnedOpen(true);
    // The textarea does not exist until this render lands.
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, []);

  // Clicking away closes it again. Model and aspect pickers are Radix popovers
  // portalled to document.body, so a plain "outside the composer" test would
  // treat picking a model as clicking away and shut the composer mid-choice.
  useEffect(() => {
    if (!pinnedOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (composerRef.current?.contains(target)) return;
      if (target.closest('[data-radix-popper-content-wrapper]')) return;
      if (target.closest('[role="dialog"]')) return;
      setPinnedOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPinnedOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [pinnedOpen]);

  // ── Model legality ────────────────────────────────────────────────────────

  /**
   * Keep duration, aspect and resolution legal whenever the video model changes.
   *
   * The first pass is deliberately different: it runs against whatever was
   * restored from the cache and only nudges it into range, where every later
   * pass resets to the new model's own default. Without the split, a reload
   * would throw away a chosen duration on the way back in.
   */
  const firstVideoSync = useRef(true);
  useEffect(() => {
    const model = VIDEO_MODELS[videoModel];
    if (!model) return;
    const allowedAspects = model.aspectRatios ?? ['16:9', '9:16', '1:1'];
    const allowedResolutions = getVideoResolutions(model);

    if (firstVideoSync.current) {
      firstVideoSync.current = false;
      setDuration((d) => snapVideoDuration(model, d));
    } else {
      // snapVideoDuration also lands enum-duration models on a legal value, so
      // switching from a 5s model to Veo does not leave an unrenderable 5.
      setDuration((d) => snapVideoDuration(model, model.defaultDuration ?? d));
    }
    setVideoAspect((a) => (allowedAspects.includes(a) ? a : allowedAspects[0]));
    // Charging for 1080p on a model that tops out at 720p is a refund waiting
    // to happen — the provider silently renders the lower one.
    setResolution((r) => (allowedResolutions.includes(r) ? r : (allowedResolutions[allowedResolutions.length - 1] as Resolution)));
  }, [videoModel]);

  const aspect =
    mode === 'image'
      ? imageAspect
      : mode === 'video'
        ? videoAspect
        : mode === 'audio'
          ? AUDIO_ASPECT
          : MODEL3D_ASPECT;
  const resolvedPrompt = useMemo(() => applyPreset(preset, prompt), [preset, prompt]);

  /** Applying a preset also adopts the model and aspect it was tuned for. */
  const pickPreset = useCallback((next: CreatorPreset | null) => {
    if (next?.requiresImage && !reference) {
      // Adopting its model anyway would swap in a different engine at a
      // different price than the tile advertised.
      toast.error(`${next.name} needs an attached image. Attach one first.`);
      return;
    }
    setPresetId(next?.id ?? null);
    if (!next) return;
    if (next.kind === 'image') {
      if (next.model && next.model in IMAGE_MODELS) setImageModel(next.model as ImageModelKey);
      if (next.aspect) setImageAspect(next.aspect);
    } else if (next.kind === 'video') {
      if (next.model && next.model in VIDEO_MODELS) setVideoModel(next.model as VideoModelKey);
      if (next.aspect) setVideoAspect(next.aspect);
    } else if (next.kind === 'audio') {
      // Audio presets carry a task rather than a model, and the strip only ever
      // shows the active task's own — so this is a no-op in practice. It stays
      // as the guarantee that picking a tile can never leave the composer on a
      // task the scaffold was not written for.
      if (next.audioTask) setAudioTask(next.audioTask);
      // The speech scaffolds lean on v3's inline performance tags, which no
      // other model reads: on Multilingual v2 they would be spoken aloud.
      if (next.audioTask === 'speech') setTtsModel('eleven_v3');
    } else {
      // 3D presets carry no aspect — a mesh has none.
      if (next.model && next.model in MODEL3D_MODELS) {
        setModel3dModel(next.model as Model3dModelKey);
      }
    }
    textareaRef.current?.focus();
  }, [reference, setPresetId]);

  /**
   * Switching mode now only switches mode. Each workspace keeps its own prompt,
   * preset and attachment, so all three can be in progress at once.
   */
  const switchMode = useCallback((next: Mode) => setMode(next), []);

  const enhance = useCallback(async () => {
    const current = prompt.trim();
    if (!current || enhancing) return;
    setEnhancing(true);
    try {
      const next = await enhancePrompt(current, mode);
      if (next && next !== current) {
        setBeforeEnhance((b) => ({ ...b, [mode]: current }) as ByMode<string | null>);
        setPrompt(next);
      } else {
        // Also the response when the edge function has not been redeployed with
        // the prompt-assist modes yet: it falls through to spellcheck and hands
        // the text straight back.
        toast.info('No changes suggested for that prompt.');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not enhance that prompt.');
    } finally {
      setEnhancing(false);
    }
  }, [prompt, enhancing, mode, setPrompt]);

  const editPrompt = useCallback(
    (value: string) => {
      setPrompt(value);
      // Editing by hand makes the pre-enhance snapshot stale, so retire the
      // undo rather than let it revert to something unexpected.
      setBeforeEnhance((b) =>
        b[mode] === null ? b : ({ ...b, [mode]: null } as ByMode<string | null>),
      );
    },
    [mode, setPrompt],
  );

  /**
   * The audio tasks that transform an upload take a media file, not an image,
   * and hold it as a File rather than a data URL — a 100 MB recording read into
   * base64 is a third larger again and would be encoded into the request body
   * instead of posted as multipart.
   */
  const attachAudioFile = useCallback(async (file: File) => {
    if (file.size > MAX_AUDIO_UPLOAD_BYTES) {
      toast.error('That file is over 100 MB. Use a shorter or smaller one.');
      return;
    }
    setAttaching(true);
    try {
      // Read the length up front: it is what the two metered tasks are priced
      // on, and the paywall must show the number it is about to charge.
      const seconds = await readMediaDuration(file);
      setAudioFile({ file, seconds });
    } finally {
      setAttaching(false);
    }
  }, []);

  const attachFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Attach an image to use as a reference.');
      return;
    }
    // Reject here rather than after payment: anything past this is staged in
    // storage, and a 40 MB original is slow to upload and pointless as a
    // reference at generation resolutions.
    if (file.size > MAX_REFERENCE_BYTES) {
      toast.error('That image is over 20 MB. Use a smaller version as the reference.');
      return;
    }
    setAttaching(true);
    try {
      const url = await fileToDataUrl(file);
      setReference({ url, label: file.name });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not attach that image.');
    } finally {
      setAttaching(false);
    }
  }, [setReference]);

  /** Bring the composer back into view and ready to type, wherever the page is. */
  const focusComposer = useCallback(() => {
    setPinnedOpen(true);
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  /** "Animate this" on an image result, and "load into composer" on a failure. */
  const loadJob = useCallback((job: GenerationJob) => {
    const target: Mode =
      job.kind === 'video' || (job.kind === 'image' && job.status === 'done' && job.url)
        ? 'video'
        : job.kind === 'model3d'
          ? '3d'
          : job.kind === 'audio'
            ? 'audio'
            : 'image';

    setMode(target);
    setPromptFor(target, job.prompt);
    setPresetFor(target, job.presetId ?? null);

    if (job.kind === 'audio') {
      // The job records which of the nine tools made it, so reloading a failed
      // run comes back on the right one rather than defaulting to speech.
      if (isAudioTask(job.model)) setAudioTask(job.model);
      // The upload it worked from cannot be restored — a File is not persisted
      // and a blob URL is dead by now — so the media tasks come back needing a
      // fresh attachment. Clearing it is what makes that obvious rather than
      // leaving a stale filename in the composer.
      setAudioFile(null);
    } else if (job.kind === 'image' && job.status === 'done' && job.url) {
      setReferenceFor('video', { url: job.url, label: 'Generated still' });
      setVideoModel('runway-gen4');
      setPresetFor('video', 'animate-still');
    } else if (job.kind === 'video') {
      if (job.model in VIDEO_MODELS) setVideoModel(job.model as VideoModelKey);
    } else if (job.kind === 'model3d') {
      // Put the original reference back BEFORE the model, or the legality
      // effect sees an empty attachment and swaps in a text-only model at a
      // different price than the one that was paid for.
      if (job.sourceImage) setReferenceFor('3d', { url: job.sourceImage, label: 'Original reference' });
      if (job.model in MODEL3D_MODELS) setModel3dModel(job.model as Model3dModelKey);
    } else {
      if (job.model in IMAGE_MODELS) setImageModel(job.model as ImageModelKey);
    }
    focusComposer();
  }, [focusComposer, setPromptFor, setPresetFor, setReferenceFor]);

  /** "Make it 3D" on a finished still: reload it as the reference for a mesh. */
  const model3dFromJob = useCallback((job: GenerationJob) => {
    if (!job.url) return;
    setMode('3d');
    setReferenceFor('3d', { url: job.url, label: 'Generated still' });
    setPromptFor('3d', job.prompt);
    // Hunyuan3D is the image-only specialist and the cheapest honest choice for
    // reconstructing something that already exists as a picture.
    setModel3dModel('hunyuan3d-v2');
    setPresetFor('3d', 'photo-to-mesh');
    focusComposer();
  }, [focusComposer, setPromptFor, setPresetFor, setReferenceFor]);

  /**
   * Keep the 3D model legal for what is attached. Several of them are
   * image-only, so dropping the reference while one is selected would otherwise
   * leave a Generate button that can only fail — after payment.
   */
  useEffect(() => {
    if (mode !== '3d' || references['3d']) return;
    const model = MODEL3D_MODELS[model3dModel];
    if (model && !model.supports.includes('text-to-3d')) setModel3dModel('tripo-2.5');
    // Drop a preset that only makes sense with an attachment too. Leaving it
    // would send "reconstruct the attached image" to a text-only model, at a
    // price the preset never advertised.
    setPresetIds((p) => (getPreset(p['3d'])?.requiresImage ? { ...p, '3d': null } : p));
  }, [mode, references, model3dModel]);

  /**
   * Nothing to generate from yet. Deliberately NOT part of `blockingIssue`:
   * an empty prompt box needs no sentence explaining that it is empty, and the
   * placeholder already says what to type. Generate stays inert and puts the
   * cursor in the box instead of scolding.
   *
   * A mesh from an attached photo needs no words, so the prompt is only
   * required when there is nothing else to work from.
   */
  const promptMissing = useMemo(() => {
    // Four of the audio tasks work entirely from an upload and have no text
    // box at all, so an empty prompt is the normal state rather than a gap.
    if (mode === 'audio') return activeAudioTask.promptRole !== 'none' && !resolvedPrompt.trim();
    return (mode !== '3d' || !reference) && !resolvedPrompt.trim();
  }, [mode, reference, resolvedPrompt, activeAudioTask]);

  /** Guardrails that would otherwise only surface as a paid-for failure. */
  const blockingIssue = useMemo(() => {
    if (!isAuthenticated) return 'Sign in to generate.';
    if (mode === 'image') {
      const model = IMAGE_MODELS[imageModel];
      if (model && reference && !imageModelSupportsEdit(model)) {
        return `${model.name} cannot edit an attached image. Remove it or pick another model.`;
      }
    }
    if (mode === 'video') {
      const model = VIDEO_MODELS[videoModel];
      if (!model) return 'Pick a video model.';
      if (!model.supports.includes('image-to-video') && reference) {
        return `${model.name} cannot use a reference image. Remove it or pick another model.`;
      }
      if (!model.supports.includes('text-to-video') && !reference) {
        return `${model.name} needs an image to animate. Attach one first.`;
      }
    }
    if (mode === '3d') {
      const model = MODEL3D_MODELS[model3dModel];
      if (!model) return 'Pick a 3D model.';
      if (!model.supports.includes('text-to-3d') && !reference) {
        return `${model.name} needs an image to work from. Attach one first.`;
      }
    }
    if (mode === 'audio') {
      if (activeAudioTask.needsMedia && !audioFile) {
        return `${activeAudioTask.label} needs a file to work from. Attach one first.`;
      }
      if (activeAudioTask.usesVoice && !voiceId) return 'Pick a voice first.';
      // Caught here rather than at the edge function: two of these tasks are
      // charged for before the call, so an over-length script must fail while
      // it is still free to say no.
      if (activeAudioTask.promptRole !== 'none' && resolvedPrompt.length > MAX_SPEECH_CHARS) {
        return `That is ${resolvedPrompt.length.toLocaleString()} characters. The limit is ${MAX_SPEECH_CHARS.toLocaleString()}.`;
      }
      if (audioTask === 'dialogue' && !parseDialogue(resolvedPrompt, voiceId).length) {
        return 'Write the scene as "Name: line", one speaker per line.';
      }
    }
    return null;
  }, [
    isAuthenticated,
    mode,
    imageModel,
    videoModel,
    model3dModel,
    reference,
    activeAudioTask,
    audioFile,
    voiceId,
    resolvedPrompt,
    audioTask,
  ]);

  /** Billable units and the label the paywall shows for them. */
  const audioUnits = useMemo(
    () =>
      billableUnits(
        activeAudioTask,
        audioTask === 'music' ? musicSeconds : (audioFile?.seconds ?? null),
      ),
    [activeAudioTask, audioTask, musicSeconds, audioFile],
  );

  const audioQuantityLabel = useMemo(() => {
    if (audioTask === 'music') return `${musicSeconds}s track`;
    const seconds = audioFile?.seconds;
    if (seconds == null) return 'Length unknown — billed as 1 min';
    const mins = Math.floor(seconds / 60);
    const rest = Math.round(seconds % 60);
    return mins ? `${mins}m ${rest}s` : `${rest}s`;
  }, [audioTask, musicSeconds, audioFile]);

  /**
   * Queue the chosen audio task.
   *
   * Called directly for the six free tools, and by the paywall's onConfirm for
   * the three paid ones — which is why it takes no arguments and reads the
   * composer's own state: the settings were all chosen before the transfer, so
   * there is nothing for the modal to hand back.
   */
  const runAudio = useCallback(() => {
    setAudioPaywallOpen(false);

    const voiceTuning = {
      stability,
      similarity,
      style,
      speakerBoost: DEFAULT_VOICE_SETTINGS.speakerBoost,
      speed,
    };

    let request: AudioRequest;
    switch (audioTask) {
      case 'dialogue':
        request = {
          task: 'dialogue',
          inputs: parseDialogue(resolvedPrompt, voiceId),
          voiceSettings: voiceTuning,
        };
        break;
      case 'sfx':
        request = {
          task: 'sfx',
          text: resolvedPrompt,
          // 0 is "let the model choose", and the engine leaves the field off
          // entirely for it — sending a zero is a validation error upstream.
          durationSeconds: sfxSeconds || undefined,
          promptInfluence,
          loop: loopSfx,
        };
        break;
      case 'music':
        request = {
          task: 'music',
          prompt: resolvedPrompt,
          lengthSeconds: musicSeconds,
          instrumental,
        };
        break;
      case 'voice-changer':
        if (!audioFile) return;
        request = {
          task: 'voice-changer',
          file: audioFile.file,
          voiceId,
          voiceSettings: voiceTuning,
        };
        break;
      case 'dubbing':
        if (!audioFile) return;
        request = { task: 'dubbing', file: audioFile.file, targetLang: dubTargetLang };
        break;
      case 'transcribe':
        if (!audioFile) return;
        request = { task: 'transcribe', file: audioFile.file, diarize: true };
        break;
      case 'isolate':
        if (!audioFile) return;
        request = { task: 'isolate', file: audioFile.file };
        break;
      default:
        request = {
          task: 'speech',
          text: resolvedPrompt,
          voiceId,
          modelId: ttsModel,
          languageCode: speechLang || undefined,
          voiceSettings: voiceTuning,
        };
    }

    startAudio(request, {
      // The media tasks have no prompt, so the filename is the only honest
      // caption for the card — 'Untitled' on all four told you nothing.
      prompt: prompt.trim() || preset?.sample || audioFile?.file.name || activeAudioTask.label,
      resolvedPrompt,
      modelName:
        audioTask === 'speech'
          ? (TTS_MODELS[ttsModel]?.name ?? activeAudioTask.label)
          : activeAudioTask.label,
      presetId: presetId ?? undefined,
      aspect: AUDIO_ASPECT,
    });

    toast.success(
      audioTask === 'dubbing'
        ? 'Dub queued. It keeps running if you leave the page.'
        : 'Generation started.',
    );
  }, [
    audioTask,
    activeAudioTask,
    resolvedPrompt,
    prompt,
    preset,
    presetId,
    voiceId,
    ttsModel,
    speechLang,
    stability,
    similarity,
    style,
    speed,
    sfxSeconds,
    promptInfluence,
    loopSfx,
    musicSeconds,
    instrumental,
    dubTargetLang,
    audioFile,
    startAudio,
  ]);

  const openPaywall = useCallback(async () => {
    if (promptMissing) {
      openComposer();
      return;
    }
    if (blockingIssue) {
      toast.error(blockingIssue);
      return;
    }
    if (mode === 'image') {
      setImagePaywallOpen(true);
      return;
    }
    if (mode === 'video') {
      setVideoPaywallOpen(true);
      return;
    }
    if (mode === 'audio') {
      // Voice design is not a generation job — it produces three takes to
      // audition and keeps whichever one is wanted, so it opens its own drawer
      // rather than going through the queue.
      if (audioTask === 'voice-design') {
        setVoiceDesignOpen(true);
        return;
      }
      // Six of the nine cost a fraction of a cent and skip the paywall
      // entirely; only music, the voice changer and dubbing settle on chain.
      if (activeAudioTask.paid) setAudioPaywallOpen(true);
      else runAudio();
      return;
    }

    // No 3D endpoint accepts a data URL, so an attached reference has to be
    // hosted before the mesh can be queued. Do it HERE, before the paywall
    // opens — staging it after the transfer would mean an upload failure burned
    // the DHB with nothing queued at the provider and no ticket to reconnect to.
    if (reference?.url.startsWith('data:')) {
      setStaging(true);
      try {
        const hosted = await hostDataUrl(reference.url);
        setReferenceFor('3d', { ...reference, url: hosted });
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : 'Could not upload that reference. Nothing was charged.',
        );
        return;
      } finally {
        setStaging(false);
      }
    }
    setModel3dPaywallOpen(true);
  }, [
    promptMissing,
    openComposer,
    blockingIssue,
    mode,
    reference,
    setReferenceFor,
    audioTask,
    activeAudioTask,
    runAudio,
  ]);

  /** Called by the paywall once the DHB transfer confirms. */
  const runImage = useCallback(() => {
    setImagePaywallOpen(false);
    const meta = {
      prompt: prompt.trim() || preset?.sample || 'Untitled',
      resolvedPrompt,
      modelName: IMAGE_MODELS[imageModel]?.name ?? imageModel,
      presetId: presetId ?? undefined,
      aspect: imageAspect,
    };
    for (let i = 0; i < batch; i += 1) {
      startImage(
        {
          prompt: resolvedPrompt,
          model: imageModel,
          aspectRatio: imageAspect,
          ...(reference ? { sourceImage: reference.url } : {}),
        },
        meta,
      );
    }
    toast.success(batch > 1 ? `${batch} images queued.` : 'Generation started.');
  }, [prompt, preset, resolvedPrompt, imageModel, imageAspect, batch, reference, presetId, startImage]);

  const runVideo = useCallback(
    (options?: VideoGenerationOptions) => {
      setVideoPaywallOpen(false);
      startVideo(
        {
          prompt: resolvedPrompt,
          model: videoModel,
          aspectRatio: videoAspect,
          duration: options?.duration ?? duration,
          // Only send a resolution to models that declare support for one.
          // Otherwise a value picked on Seedance leaked into Kling, which is
          // neither charged for it nor able to honour it.
          resolution: activeVideoModel?.supportsResolution
            ? (options?.resolution ?? resolution)
            : undefined,
          negativePrompt: options?.negativePrompt || preset?.negative,
          referenceImageUrls: options?.referenceImageUrls,
          endFrameUrl: options?.endFrameUrl,
          audioUrls: options?.audioUrls,
          videoUrls: options?.videoUrls,
          seed: options?.seed,
          ...(reference ? { sourceImage: reference.url } : {}),
        },
        {
          prompt: prompt.trim() || preset?.sample || 'Untitled',
          resolvedPrompt,
          modelName: VIDEO_MODELS[videoModel]?.name ?? videoModel,
          presetId: presetId ?? undefined,
          aspect: videoAspect,
        },
      );
      toast.success('Render queued. It will appear below when it lands.');
    },
    [
      resolvedPrompt,
      videoModel,
      videoAspect,
      duration,
      resolution,
      activeVideoModel,
      preset,
      reference,
      prompt,
      presetId,
      startVideo,
    ],
  );

  /** Called by the paywall once the DHB transfer confirms. */
  const run3d = useCallback(
    (options?: Model3dGenerationOptions) => {
      setModel3dPaywallOpen(false);
      startModel3d(
        {
          // Image-only runs legitimately carry no prompt.
          ...(resolvedPrompt.trim() ? { prompt: resolvedPrompt } : {}),
          model: model3dModel,
          negativePrompt: preset?.negative,
          textureQuality: options?.textureQuality,
          pbr: options?.pbr,
          faceLimit: options?.faceLimit,
          quad: options?.quad,
          seed: options?.seed,
          exportFormat: options?.exportFormat,
          ...(reference ? { sourceImage: reference.url } : {}),
        },
        {
          // No 'Untitled' fallback here, unlike image and video: a mesh made
          // from a photo alone legitimately has no prompt, and the placeholder
          // would end up as the card caption and the thumbnail's alt text.
          // Empty lets both fall through to 'Generated 3D model'.
          prompt: prompt.trim() || preset?.sample || '',
          resolvedPrompt,
          modelName: MODEL3D_MODELS[model3dModel]?.name ?? model3dModel,
          presetId: presetId ?? undefined,
          aspect: MODEL3D_ASPECT,
        },
      );
      toast.success('Mesh queued. It will appear below when it lands.');
    },
    [resolvedPrompt, model3dModel, preset, reference, prompt, presetId, startModel3d],
  );

  const modelOptions: ChipOption<string>[] =
    mode === 'image'
      ? IMAGE_MODEL_OPTIONS.map((m) => {
          const canEdit = imageModelSupportsEdit(m);
          return {
            value: m.id,
            label: m.name,
            detail: m.description,
            meta: `$${getImageCostUsd(m).toFixed(2)}`,
            disabled: !canEdit && !!reference,
            disabledReason: 'Cannot edit an attached image',
          };
        })
      : mode === '3d'
      ? MODEL3D_MODEL_OPTIONS.map((m) => {
          const needsImage = !m.supports.includes('text-to-3d');
          return {
            value: m.id,
            label: m.name,
            detail: m.description,
            meta: `$${getModel3dCostUsd(m).toFixed(2)}`,
            disabled: needsImage && !reference,
            disabledReason: 'Needs an attached image',
          };
        })
      : mode === 'audio'
      ? TTS_MODEL_OPTIONS.map((m) => ({
          value: m.id,
          label: m.name,
          detail: m.description,
          meta: `${m.languages} langs`,
        }))
      : VIDEO_MODEL_OPTIONS.map((m) => {
          const needsImage = !m.supports.includes('text-to-video');
          const rejectsImage = !m.supports.includes('image-to-video');
          return {
            value: m.id,
            label: m.name,
            detail: m.description,
            meta: `$${getVideoCostUsd(m, m.defaultDuration ?? 5).toFixed(2)}`,
            disabled: (needsImage && !reference) || (rejectsImage && !!reference),
            disabledReason: needsImage ? 'Needs an attached image' : 'Cannot use an attached image',
          };
        });

  /** The nine audio tools, priced where they cost anything. */
  const audioTaskOptions: ChipOption<string>[] = AUDIO_TASK_OPTIONS.map((t) => ({
    value: t.id,
    label: t.label,
    detail: t.description,
    meta: t.paid ? `from $${getAudioCostUsd(t, 1).toFixed(2)}` : 'Free',
  }));

  const languageOptions: ChipOption<string>[] = AUDIO_LANGUAGES.map((l) => ({
    value: l.code,
    label: l.label,
  }));

  const aspectOptions: ChipOption<string>[] = (mode === 'image' ? [...IMAGE_ASPECTS] : videoAspects).map(
    (a) => ({ value: a, label: a }),
  );

  const currentModelName =
    mode === 'image'
      ? activeImageModel?.name ?? imageModel
      : mode === '3d'
        ? activeModel3d?.name ?? model3dModel
        : mode === 'audio'
          ? // The heading reads "Start creating with X", so it names the tool
            // rather than the engine — nobody picked "Eleven v3" to clean up a
            // recording, and eight of the nine tasks have no model chip at all.
            activeAudioTask.label
          : activeVideoModel?.name ?? videoModel;

  const placeholder = preset
    ? `${preset.name}: describe the subject, for example "${preset.sample}"`
    : mode === 'image'
      ? 'Describe the image you want'
      : mode === '3d'
        ? 'Describe the object to model, or attach a photo of it'
        : mode === 'audio'
          ? activeAudioTask.placeholder
          : 'Describe the shot you want';

  const generateDisabled = promptMissing || !!blockingIssue || staging;
  const undoEnhance = beforeEnhance[mode];

  /** Prompt assist: expands a terse idea into a fuller prompt, keeping the
      subject. Always undoable, so it cannot eat what was typed. */
  const enhanceButton = (compact?: boolean) => (
    <button
      type="button"
      onClick={() => void enhance()}
      disabled={!prompt.trim() || enhancing}
      aria-label="Expand this prompt with more detail"
      title="Expand this prompt with more detail"
      className={cn(
        'shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white/70 backdrop-blur-xl transition hover:border-white/40 hover:bg-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40',
        compact ? 'hidden h-8 w-8 sm:inline-flex' : 'inline-flex p-2.5',
      )}
    >
      {enhancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
    </button>
  );

  const generateButton = (compact?: boolean) => (
    // Kept focusable rather than disabled: a disabled button leaves the tab
    // order, so its aria-describedby reason could never be read and a keyboard
    // user got no explanation at all. It stays styled as unavailable and
    // explains itself on activation instead.
    <button
      type="button"
      onClick={() => void openPaywall()}
      aria-disabled={generateDisabled}
      aria-describedby={blockingIssue && !compact ? 'studio-blocking-reason' : undefined}
      aria-label={compact ? 'Generate' : undefined}
      title={compact ? (blockingIssue ?? 'Generate') : undefined}
      className={cn(
        'inline-flex shrink-0 items-center gap-2 rounded-xl border text-[13px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
        compact ? 'px-3 py-2 sm:px-4' : 'px-5 py-2.5',
        generateDisabled
          ? 'cursor-not-allowed border-white/20 bg-white/10 text-white/70'
          : 'border-white/25 bg-white text-black hover:bg-white/90',
      )}
    >
      {staging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      <span className={compact ? 'hidden sm:inline' : undefined}>
        {staging ? 'Preparing' : 'Generate'}
      </span>
    </button>
  );

  return (
    /**
     * A fragment, not one <section>, and deliberately so.
     *
     * A sticky element is bounded by its parent's box: wrapped in a section
     * that ends after the results feed, the composer unstuck the moment that
     * section scrolled past. Returning the pieces as siblings makes <main> the
     * composer's parent, so it stays parked for the length of the page.
     */
    <>
      <section className="px-3 pb-4 pt-5 sm:px-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl font-black uppercase leading-[1.05] tracking-tight text-white sm:text-3xl">
              Start creating with {currentModelName}
            </h2>
            <p className="mt-1.5 max-w-xl text-sm text-white/45">
              Describe a scene, character, mood or style. Results land below and carry straight
              into the editor.
            </p>
          </div>

          {runningCount > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[12px] font-medium text-white/75 backdrop-blur-xl">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {runningCount} running
            </span>
          )}
        </div>
      </section>

      {/* Marks where the composer sits in normal flow — see the observer above. */}
      <div ref={sentinelRef} aria-hidden className="h-px w-full" />

      {/* Horizontal padding only. Padding or a margin on the top edge would
          ride along when it parks, leaving a transparent strip between the
          header and the composer with the page scrolling through it. */}
      <div className="sticky z-40 px-3 sm:px-4" style={{ top: stickyTop }}>
        {/* Lag guard. The clip is written on the main thread; a hard fling
            scrolls the compositor ahead of it, so for a frame a card's top edge
            flashes in the shoulders either side of the pill. This strip is
            anchored to the sticky wrapper, which never lags, and is painted the
            page's own background — invisible at rest, and it swallows the
            flash. Flat paint is only safe here because /creator's backdrop is a
            known solid colour; over a textured surface this would have to be
            frost instead. It sits BEHIND the pill so the glass and the rounded
            cut are untouched. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-6 bg-[#090a0b]"
        />

        {/* The swallow clip's cut element: its top edge is the cut line and its
            own corner radius is what the clip traces. Keep it the only surface
            inside the sticky wrapper, and keep that wrapper transparent — a
            background there would paint a box around the pill. */}
        <div
          ref={composerRef}
          data-creator-composer
          className={cn(
            'rounded-2xl border transition-[padding,background-color,box-shadow] duration-200',
            collapsed
              ? 'border-white/15 bg-[#141518]/95 p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-2xl'
              : stuck
                ? 'border-white/15 bg-[#141518]/95 p-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-2xl'
                : 'border-white/12 bg-white/[0.04] p-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-xl',
          )}
        >
          {collapsed ? (
            /* Parked under the header: one line, and clicking it opens back up. */
            <div className="flex items-center gap-2">
              <ModeToggle mode={mode} onChange={switchMode} compact />

              <input
                type="text"
                value={prompt}
                onChange={(e) => editPrompt(e.target.value)}
                onFocus={openComposer}
                onPointerDown={openComposer}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void openPaywall();
                  }
                }}
                placeholder={placeholder}
                aria-label="Prompt"
                className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-[14px] text-white outline-none placeholder:text-white/35"
              />

              {reference && (
                <img
                  src={reference.url}
                  alt=""
                  title={reference.label}
                  className="hidden h-7 w-7 shrink-0 rounded-lg object-cover sm:block"
                />
              )}

              {(mode !== 'audio' || activeAudioTask.needsMedia) && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={attaching}
                  aria-label={mode === 'audio' ? 'Attach a recording' : 'Attach a reference image'}
                  className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/[0.10] hover:text-white disabled:opacity-40 sm:inline-flex"
                >
                  {attaching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Paperclip className="h-4 w-4" />
                  )}
                </button>
              )}

              {enhanceButton(true)}
              {generateButton(true)}
            </div>
          ) : (
            <>
              {mode === 'audio' && audioFile && (
                <div className="mb-2 flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/40 p-2">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/[0.08]">
                    <Music2 className="h-5 w-5 text-white/50" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-white/85">
                      {audioFile.file.name}
                    </p>
                    <p className="text-[11px] text-white/40">
                      {audioFile.seconds == null
                        ? 'Length could not be read — billed as one minute'
                        : `${audioQuantityLabel}${activeAudioTask.paid ? ' — billed on this' : ''}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAudioFile(null)}
                    aria-label="Remove attached file"
                    className="rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {mode !== 'audio' && reference && (
                <div className="mb-2 flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/40 p-2">
                  <img
                    src={reference.url}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-white/85">{reference.label}</p>
                    <p className="text-[11px] text-white/40">
                      {mode === 'image'
                        ? 'Used as an edit reference'
                        : mode === '3d'
                          ? activeModel3d?.usesPromptWithImage
                            ? 'Object to reconstruct — your prompt guides it'
                            : `Object to reconstruct — ${activeModel3d?.name ?? 'this model'} ignores the prompt`
                          : 'First frame to animate'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReference(null)}
                    aria-label="Remove reference image"
                    className="rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <div className="flex items-start gap-2">
                {/* Sound effects, music and voice design have nothing to attach
                    — offering a paperclip there is a control that can only
                    produce an error. */}
                {(mode !== 'audio' || activeAudioTask.needsMedia) && (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={attaching}
                    aria-label={
                      mode === 'audio' ? 'Attach a recording' : 'Attach a reference image'
                    }
                    className="mt-0.5 shrink-0 rounded-xl border border-white/15 bg-white/[0.06] p-2.5 text-white/70 transition hover:border-white/30 hover:bg-white/[0.12] hover:text-white disabled:opacity-40"
                  >
                    {attaching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Paperclip className="h-4 w-4" />
                    )}
                  </button>
                )}

                {activeAudioTask.promptRole === 'none' && mode === 'audio' ? (
                  // Nothing to type for these four: the upload IS the input, so
                  // the box is replaced by what to do rather than left empty
                  // with a placeholder nobody can act on.
                  <p className="flex min-h-[3.25rem] flex-1 items-center text-[14px] text-white/45">
                    {audioFile
                      ? `Ready — ${activeAudioTask.label.toLowerCase()} this recording.`
                      : 'Attach a recording to start.'}
                  </p>
                ) : (
                  <>
                    <label htmlFor="studio-prompt" className="sr-only">
                      Prompt
                    </label>
                    <textarea
                      id="studio-prompt"
                      ref={textareaRef}
                      value={prompt}
                      onChange={(e) => editPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        // Enter submits everywhere else, but a dialogue script
                        // is written across lines — so plain Enter has to stay
                        // a newline there.
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          void openPaywall();
                        }
                      }}
                      rows={audioTask === 'dialogue' && mode === 'audio' ? 4 : 2}
                      placeholder={placeholder}
                      className="min-h-[3.25rem] w-full resize-y bg-transparent py-2 text-[15px] leading-relaxed text-white outline-none placeholder:text-white/35"
                    />
                  </>
                )}
              </div>

              {undoEnhance !== null && (
                <div className="mt-1 flex items-center gap-2 px-1">
                  <span className="text-[11px] text-white/45">Prompt expanded.</span>
                  <button
                    type="button"
                    onClick={() => {
                      setPrompt(undoEnhance);
                      setBeforeEnhance((b) => ({ ...b, [mode]: null }) as ByMode<string | null>);
                    }}
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white/70 underline-offset-2 transition hover:bg-white/10 hover:text-white hover:underline"
                  >
                    Undo
                  </button>
                </div>
              )}

              {/* Settings rail. The mode toggle sits outside the scrolling part
                  so it never slides out of reach on a narrow screen. */}
              <div className="mt-1.5 flex items-end gap-2">
                <ModeToggle mode={mode} onChange={switchMode} />

                <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {/* Audio leads with the tool, not the engine: which of the
                      nine is running decides every other chip on the rail. */}
                  {mode === 'audio' && (
                    <SelectChip
                      label="Tool"
                      width="md"
                      value={audioTask}
                      options={audioTaskOptions}
                      onChange={(v) => setAudioTask(v as AudioTask)}
                    />
                  )}

                  {/* Only speech picks a voice model. Sound effects, music and
                      the transformations each run on one fixed endpoint, so a
                      model chip there would be a control over nothing. */}
                  {(mode !== 'audio' || audioTask === 'speech') && (
                    <SelectChip
                      label="Model"
                      width="md"
                      searchable
                      searchPlaceholder="Search models…"
                      value={
                        mode === 'image'
                          ? imageModel
                          : mode === '3d'
                            ? model3dModel
                            : mode === 'audio'
                              ? ttsModel
                              : videoModel
                      }
                      options={modelOptions}
                      onChange={(v) => {
                        if (mode === 'image') setImageModel(v as ImageModelKey);
                        else if (mode === '3d') setModel3dModel(v as Model3dModelKey);
                        else if (mode === 'audio') setTtsModel(v as TtsModelKey);
                        else setVideoModel(v as VideoModelKey);
                      }}
                    />
                  )}
                  {/* A mesh has no framing and neither does a sound, so the
                      aspect chip is meaningless in both. */}
                  {mode !== '3d' && mode !== 'audio' && (
                    <SelectChip
                      label="Aspect ratio"
                      value={aspect}
                      options={aspectOptions}
                      onChange={(v) => (mode === 'image' ? setImageAspect(v) : setVideoAspect(v))}
                    />
                  )}

                  {mode === 'audio' && (
                    <>
                      {activeAudioTask.usesVoice && (
                        <StudioVoicePicker
                          value={voiceId}
                          onChange={setVoiceId}
                          onDesignVoice={() => {
                            setAudioTask('voice-design');
                            focusComposer();
                          }}
                        />
                      )}

                      {(audioTask === 'speech' || audioTask === 'dialogue') && (
                        <>
                          <SelectChip
                            label="Delivery"
                            value={String(stability)}
                            display={
                              stability <= 0.35 ? 'Expressive' : stability >= 0.7 ? 'Consistent' : 'Natural'
                            }
                            options={[
                              {
                                value: '0.3',
                                label: 'Expressive',
                                detail: 'Varies take to take, more emotion',
                              },
                              { value: '0.5', label: 'Natural', detail: 'The safe middle' },
                              {
                                value: '0.75',
                                label: 'Consistent',
                                detail: 'Repeatable, flatter delivery',
                              },
                            ]}
                            onChange={(v) => setStability(Number(v))}
                          />
                          <SelectChip
                            label="Style"
                            value={String(style)}
                            display={style <= 0.1 ? 'None' : style >= 0.6 ? 'Heavy' : 'Some'}
                            options={[
                              { value: '0', label: 'None', detail: 'Neutral read, most stable' },
                              { value: '0.3', label: 'Some', detail: 'A little exaggeration' },
                              {
                                value: '0.7',
                                label: 'Heavy',
                                detail: 'Strong delivery — can destabilise',
                              },
                            ]}
                            onChange={(v) => setStyle(Number(v))}
                          />
                        </>
                      )}

                      {/* v3 paces itself from the tags and the punctuation, and
                          rejects a speed multiplier outright. */}
                      {audioTask === 'speech' && TTS_MODELS[ttsModel]?.supportsSpeed && (
                        <SelectChip
                          label="Pace"
                          value={String(speed)}
                          display={speed < 1 ? 'Slower' : speed > 1 ? 'Faster' : 'Normal'}
                          options={[
                            { value: '0.85', label: 'Slower' },
                            { value: '1', label: 'Normal' },
                            { value: '1.15', label: 'Faster' },
                          ]}
                          onChange={(v) => setSpeed(Number(v))}
                        />
                      )}

                      {audioTask === 'speech' && (
                        <SelectChip
                          label="Language"
                          searchable
                          searchPlaceholder="Search languages…"
                          value={speechLang}
                          display={
                            AUDIO_LANGUAGES.find((l) => l.code === speechLang)?.label ?? 'Auto'
                          }
                          options={[
                            {
                              value: '',
                              label: 'Auto',
                              detail: 'Read the language from the text',
                            },
                            ...languageOptions,
                          ]}
                          onChange={setSpeechLang}
                        />
                      )}

                      {audioTask === 'sfx' && (
                        <>
                          <SelectChip
                            label="Length"
                            value={String(sfxSeconds)}
                            display={sfxSeconds ? `${sfxSeconds}s` : 'Auto'}
                            options={[
                              { value: '0', label: 'Auto', detail: 'Let the model choose' },
                              { value: '2', label: '2s' },
                              { value: '5', label: '5s' },
                              { value: '10', label: '10s' },
                              { value: '22', label: '22s' },
                              { value: '30', label: '30s', detail: 'Maximum' },
                            ]}
                            onChange={(v) => setSfxSeconds(Number(v))}
                          />
                          <SelectChip
                            label="Follow prompt"
                            value={String(promptInfluence)}
                            display={
                              promptInfluence >= 0.7
                                ? 'Literally'
                                : promptInfluence <= 0.2
                                  ? 'Loosely'
                                  : 'Balanced'
                            }
                            options={[
                              { value: '0.1', label: 'Loosely', detail: 'More creative licence' },
                              { value: '0.3', label: 'Balanced' },
                              { value: '0.8', label: 'Literally', detail: 'Stick to the words' },
                            ]}
                            onChange={(v) => setPromptInfluence(Number(v))}
                          />
                          <ToggleChip
                            label="Loop"
                            active={loopSfx}
                            onClick={() => setLoopSfx((v) => !v)}
                          />
                        </>
                      )}

                      {audioTask === 'music' && (
                        <>
                          <SelectChip
                            label="Length"
                            value={String(musicSeconds)}
                            display={`${musicSeconds}s`}
                            options={[10, 30, 60, 90, 120, 180, 240, 300]
                              .filter((s) => s >= MUSIC_MIN_SECONDS && s <= MUSIC_MAX_SECONDS)
                              .map((s) => ({
                                value: String(s),
                                label: s >= 60 ? `${s / 60}m` : `${s}s`,
                                // Priced per 10s, so the rail shows what each
                                // length costs before the paywall opens.
                                meta: `$${getAudioCostUsd(activeAudioTask, s / 10).toFixed(2)}`,
                              }))}
                            onChange={(v) => setMusicSeconds(Number(v))}
                          />
                          <ToggleChip
                            label="Instrumental"
                            active={instrumental}
                            onClick={() => setInstrumental((v) => !v)}
                          />
                        </>
                      )}

                      {audioTask === 'dubbing' && (
                        <SelectChip
                          label="Dub into"
                          searchable
                          searchPlaceholder="Search languages…"
                          value={dubTargetLang}
                          display={AUDIO_LANGUAGES.find((l) => l.code === dubTargetLang)?.label}
                          options={languageOptions}
                          onChange={setDubTargetLang}
                        />
                      )}
                    </>
                  )}

                  {mode === 'image' && (
                    <CounterChip
                      label="images"
                      singular="image"
                      value={batch}
                      min={1}
                      max={MAX_IMAGE_BATCH}
                      onChange={setBatch}
                    />
                  )}

                  {mode === 'video' && (
                    <>
                      {/* Enum-duration models get a picker, not a stepper: their
                          provider rejects the in-between values a stepper
                          produces, and the creator has already been charged on
                          this number. */}
                      {activeVideoModel?.allowedDurations?.length ? (
                        <SelectChip
                          label="Duration"
                          value={String(duration)}
                          options={activeVideoModel.allowedDurations.map((d) => ({
                            value: String(d),
                            label: `${d}s`,
                          }))}
                          onChange={(v) => setDuration(Number(v))}
                        />
                      ) : (
                        <CounterChip
                          label="seconds"
                          singular="second"
                          value={duration}
                          min={activeVideoModel?.minDuration ?? 5}
                          max={activeVideoModel?.maxDuration ?? 10}
                          onChange={setDuration}
                        />
                      )}
                      {activeVideoModel?.supportsResolution && (
                        <SelectChip
                          label="Resolution"
                          value={resolution}
                          options={videoResolutions.map((r) => ({
                            value: r,
                            label: r,
                            detail:
                              r === '480p'
                                ? 'Fastest'
                                : r === '720p'
                                  ? 'Balanced'
                                  : 'Highest quality',
                          }))}
                          onChange={(v) => setResolution(v as Resolution)}
                        />
                      )}
                    </>
                  )}
                </div>

                {enhanceButton()}
                {generateButton()}
              </div>

              {blockingIssue && (
                <p id="studio-blocking-reason" className="mt-2 px-1 text-[12px] text-white/45">
                  {blockingIssue}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <section ref={studioTailRef} className="px-3 pb-6 sm:px-4">
        {/* One input for both channels. The accept list and the handler follow
            the mode, so the picker offers recordings on the audio tasks that
            take one and pictures everywhere else. */}
        <input
          ref={fileRef}
          type="file"
          accept={mode === 'audio' ? (activeAudioTask.mediaAccept ?? 'audio/*') : 'image/*'}
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void (mode === 'audio' ? attachAudioFile(file) : attachFile(file));
            e.target.value = '';
          }}
        />

        <div className="mt-5">
          <PresetStrip
            kind={mode}
            activeId={presetId}
            onPick={pickPreset}
            audioTask={audioTask}
          />
        </div>

        <div className="mt-7">
          <ResultsFeed
            wallet={walletAddress}
            onAnimate={loadJob}
            onModel3d={model3dFromJob}
            onOpenEditor={onOpenEditor}
          />
        </div>

        {/* The epoch key exists to tear down the portal after a surface switch,
            but it must not fire while a modal is open: remounting mid-payment
            would reset the in-flight guard and allow a second charge. Freezing
            the key while open keeps both properties. */}
        {activeImageModel && (
          <ImagePaywallModal
            key={imagePaywallOpen ? 'image-open' : `image-${surfaceEpoch}`}
            open={imagePaywallOpen}
            onOpenChange={setImagePaywallOpen}
            model={activeImageModel}
            selectedModelKey={imageModel}
            onModelChange={setImageModel}
            onConfirm={runImage}
            quantity={batch}
          />
        )}

        {activeVideoModel && (
          <VideoPaywallModal
            key={videoPaywallOpen ? 'video-open' : `video-${surfaceEpoch}`}
            open={videoPaywallOpen}
            onOpenChange={setVideoPaywallOpen}
            model={activeVideoModel}
            selectedModelKey={videoModel}
            onModelChange={setVideoModel}
            onConfirm={runVideo}
            initialDuration={duration}
            initialResolution={resolution}
          />
        )}

        {activeModel3d && (
          <Model3dPaywallModal
            key={model3dPaywallOpen ? 'model3d-open' : `model3d-${surfaceEpoch}`}
            open={model3dPaywallOpen}
            onOpenChange={setModel3dPaywallOpen}
            model={activeModel3d}
            selectedModelKey={model3dModel}
            onModelChange={setModel3dModel}
            onConfirm={run3d}
            hasReference={!!reference}
          />
        )}

        {/* Only ever opened for music, the voice changer and dubbing — the
            other six tools call runAudio directly. */}
        <AudioPaywallModal
          key={audioPaywallOpen ? 'audio-open' : `audio-${surfaceEpoch}`}
          open={audioPaywallOpen}
          onOpenChange={setAudioPaywallOpen}
          spec={activeAudioTask}
          units={audioUnits}
          quantityLabel={audioQuantityLabel}
          onConfirm={runAudio}
        />

        <VoiceDesignDrawer
          key={voiceDesignOpen ? 'voice-design-open' : `voice-design-${surfaceEpoch}`}
          open={voiceDesignOpen}
          onOpenChange={setVoiceDesignOpen}
          description={resolvedPrompt}
          onSaved={(savedVoiceId) => {
            // Adopt the new voice straight away and drop back to speech: the
            // whole point of designing one was to use it.
            setVoiceId(savedVoiceId);
            setAudioTask('speech');
            setVoiceDesignOpen(false);
          }}
        />
      </section>
    </>
  );
}

/** Small entry point used by the marketing rows further down /creator. */
export function StudioJumpButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-xl transition hover:border-white/40 hover:bg-white/20"
    >
      <Wand2 className="h-4 w-4" />
      Open the composer
    </button>
  );
}
