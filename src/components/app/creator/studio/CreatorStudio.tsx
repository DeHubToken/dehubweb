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
 * The composer keeps its shape while scrolling. Desktop uses CSS sticky;
 * phones keep it in normal flow so references cannot cover the whole viewport.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import {
  ArrowRight,
  Box,
  Film,
  ImageIcon,
  Loader2,
  Music2,
  Paperclip,
  Wand2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useJobQuote, formatDhb, useFreeImages } from '@/hooks/use-ai-quote';
import dehubCoin from '@/assets/dehub-coin.png';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import { AuthenticationError, apiCall } from '@/lib/api/dehub/core';
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
  hostCreatorFile,
  type AudioRequest,
} from '@/lib/creator/generationEngine';
import { useGenerationStore, type GenerationJob } from '@/store/generationStore';
import { useCloseOnSurfaceSwitch, useSurfaceEpoch } from '@/hooks/use-surface-switch';
import { CounterChip, SelectChip, ToggleChip, type ChipOption } from './StudioChip';
import { PresetStrip } from './PresetStrip';
import { GenerationExample } from './GenerationExample';
import { ReferenceAssets, type CreatorReferenceAsset } from './ReferenceAssets';
import { remapAssetMentions } from '@/lib/creator/assetMentions';
import { CREATOR_FAL_IMAGE_MODELS, CREATOR_FAL_VIDEO_MODELS, creatorFalImageAspects } from '../../../../../supabase/functions/_shared/creator-fal-catalog';
import { ResultsFeed } from './ResultsFeed';
import { VoiceDesignDrawer } from './VoiceDesignDrawer';
import { StudioVoicePicker } from './StudioVoicePicker';

type Mode = 'image' | 'video' | 'audio' | '3d';
type Resolution = string;
type Reference = { url: string; label: string } | null;
type ByMode<T> = Record<Mode, T>;

const MAX_IMAGE_BATCH = 4;
const MAX_REFERENCE_BYTES = 20 * 1024 * 1024;

/**
 * A mesh has no aspect ratio, but the results feed sizes every card from one.
 * Square is the honest choice for a turntable preview.
 */
const MODEL3D_ASPECT = '1:1';

/** Audio has no framing either, and the results grid still needs one per card. */
const AUDIO_ASPECT = '1:1';

const MODES: { id: Mode; labelKey: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'image', labelKey: 'creator.navImage', icon: ImageIcon },
  { id: 'video', labelKey: 'creator.navVideo', icon: Film },
  { id: 'audio', labelKey: 'creator.navAudio', icon: Music2 },
  { id: '3d', labelKey: 'creator.kind3d', icon: Box },
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
  extraReferences: ByMode<CreatorReferenceAsset[]>;
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
  extraReferences: { image: [], video: [], audio: [], '3d': [] },
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
      extraReferences: byMode(saved.extraReferences, DEFAULT_SNAPSHOT.extraReferences),
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
        typeof saved.resolution === 'string' && getVideoResolutions(VIDEO_MODELS[saved.videoModel as string]).includes(saved.resolution)
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
function readMediaDuration(file: File | string): Promise<number | null> {
  return new Promise((resolve) => {
    const url = typeof file === 'string' ? file : URL.createObjectURL(file);
    const el = document.createElement('video');
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const done = (value: number | null) => {
      if (settled) return;
      settled = true; clearTimeout(timer); el.onloadedmetadata = null; el.onerror = null; el.removeAttribute('src'); el.load();
      if (typeof file !== 'string') URL.revokeObjectURL(url);
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
    timer = setTimeout(() => done(null), 10_000);
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
    reader.onerror = () => reject(new Error(i18n.t('creator.couldNotReadFile')));
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
  const { t } = useTranslation();
  return (
    // Toggle buttons, not ARIA tabs: there is no tabpanel to control and no
    // arrow-key navigation, so aria-pressed is the honest semantic.
    <div
      role="group"
      aria-label={t('creator.whatToCreate')}
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
            aria-label={t(m.labelKey)}
            title={t(m.labelKey)}
            onClick={() => onChange(m.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
              compact ? 'px-1 py-1.5' : 'px-2.5 py-1.5',
              active ? 'bg-white text-black' : 'text-white/60 hover:bg-white/10 hover:text-white',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {!compact && <span className="hidden sm:inline">{t(m.labelKey)}</span>}
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

export const CreatorStudio = memo(function CreatorStudio({ onOpenEditor, stickyTop = 60 }: CreatorStudioProps) {
  const { t } = useTranslation();
  const { walletAddress, isAuthenticated, openLoginModal } = useAuth();
  const checkingSession = useRef(false);
  // openPaywall is declared above runImage; the ref gives it the current one.
  const runImageRef = useRef<(txHash?: string) => void>(() => {});

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
  const [extraReferences, setExtraReferences] = useState<ByMode<CreatorReferenceAsset[]>>(restored.extraReferences);

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
  const currentAssets = useMemo<CreatorReferenceAsset[]>(() => [...(reference ? [{ ...reference, kind: 'image' as const }] : []), ...extraReferences[mode]], [reference, extraReferences, mode]);
  const currentImages = currentAssets.filter(a => a.kind === 'image');
  const currentClip = currentAssets.find(a => a.kind === 'video');
  const assetDraftRef = useRef(currentAssets);
  assetDraftRef.current = currentAssets;
  const preparedAssetsRef = useRef<{ mode: Mode; assets: CreatorReferenceAsset[] } | null>(null);

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
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [referenceLibraryOpen, setReferenceLibraryOpen] = useState(false);
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

  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  // Paywalls are Radix dialogs, portalled outside the host's hidden wrapper.
  useCloseOnSurfaceSwitch(
    useCallback(() => {
      setImagePaywallOpen(false);
      setVideoPaywallOpen(false);
      setModel3dPaywallOpen(false);
      setAudioPaywallOpen(false);
      setVoiceDesignOpen(false);
      setAttachmentMenuOpen(false);
      setReferenceLibraryOpen(false);
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
      extraReferences: Object.fromEntries(Object.entries(extraReferences).map(([key, assets]) => [key, assets.filter(a => !a.file && a.url.startsWith('https:'))])) as ByMode<CreatorReferenceAsset[]>,
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
    const timer = window.setTimeout(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Over quota or storage disabled. The workspace still works for this
      // session; it just will not survive a reload.
    }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    mode,
    prompts,
    presetIds,
    references,
    extraReferences,
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

  const openComposer = useCallback(() => textareaRef.current?.focus(), []);

  // ── Model legality ────────────────────────────────────────────────────────

  useEffect(() => {
    const allowed = creatorFalImageAspects(imageModel);
    setImageAspect((value) => allowed.includes(value) ? value : allowed[0]);
  }, [imageModel, imageAspect]);

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
    if (model.requiresVideoInput && currentClip?.seconds) setDuration(Math.ceil(currentClip.seconds));
    setVideoAspect((a) => (allowedAspects.includes(a) ? a : allowedAspects[0]));
    // Charging for 1080p on a model that tops out at 720p is a refund waiting
    // to happen — the provider silently renders the lower one.
    setResolution((r) => (allowedResolutions.includes(r) ? r : (allowedResolutions[allowedResolutions.length - 1] as Resolution)));
  }, [videoModel, currentClip?.seconds]);

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
    if (next?.requiresImage && !reference && !VIDEO_MODELS[next.model ?? '']?.requiresVideoInput) {
      // Adopting its model anyway would swap in a different engine at a
      // different price than the tile advertised.
      toast.error(t('creator.presetNeedsImage', { name: t(next.nameKey) }));
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
  }, [reference, setPresetId, t]);

  /**
   * Switching mode now only switches mode. Each workspace keeps its own prompt,
   * preset and attachment, so all three can be in progress at once.
   */
  const switchMode = useCallback((next: Mode) => setMode(next), []);
  useEffect(() => {
    setAttachmentMenuOpen(false);
    setReferenceLibraryOpen(false);
  }, [mode]);

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
        toast.info(t('creator.noChangesSuggested'));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('creator.enhanceFailed'));
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
      toast.error(t('creator.fileTooLarge'));
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

  const addAsset = useCallback(async (asset: CreatorReferenceAsset) => {
    const latest = assetDraftRef.current;
    const images = latest.filter(a => a.kind === 'image');
    if (latest.some(a => a.url === asset.url)) return;
    if (asset.kind === 'video') {
      if (mode !== 'video' || latest.some(a => a.kind === 'video')) { toast.error(t('creator.referenceOneClip')); return; }
      const seconds = asset.seconds ?? await readMediaDuration(asset.file ?? asset.url);
      if (seconds == null || seconds < 3 || seconds > 30) { if (asset.file) URL.revokeObjectURL(asset.url); toast.error(t('creator.referenceClipLength')); return; }
      if (!VIDEO_MODELS[videoModel]?.requiresVideoInput) {
        setVideoModel(seconds > 15 ? 'kling-3-motion' : 'kling-o3-edit');
        setPresetFor('video', seconds > 15 ? 'reference-copy-motion' : 'reference-character-swap');
      }
      setDuration(Math.ceil(seconds));
      assetDraftRef.current = [...latest, { ...asset, seconds }];
      setExtraReferences(prev => ({ ...prev, video: [...prev.video, { ...asset, seconds }] }));
      return;
    }
    if (mode === '3d') { setReference(asset); return; }
    if (images.length >= 4) { toast.error(t('creator.referenceFourImages')); return; }
    assetDraftRef.current = [...latest, asset];
    if (!images.length) setReference(asset);
    else setExtraReferences(prev => ({ ...prev, [mode]: [...prev[mode], asset] }));
    if (mode === 'image' && images.length && !CREATOR_FAL_IMAGE_MODELS[imageModel]?.editUsesPlural) setImageModel('flux-3-image');
  }, [currentAssets, currentClip, currentImages.length, mode, reference, setReference, setPresetFor, imageModel, videoModel, t]);
  const removeAsset = useCallback((asset: CreatorReferenceAsset) => {
    const remaining = currentAssets.filter(item => item.url !== asset.url);
    editPrompt(remapAssetMentions(prompt, currentAssets.map(item => ({ key: item.url, kind: item.kind })), remaining.map(item => ({ key: item.url, kind: item.kind }))));
    assetDraftRef.current = remaining;
    if (reference?.url === asset.url) {
      const next = extraReferences[mode].find(a => a.kind === 'image');
      setReference(next ?? null);
      if (next) setExtraReferences(prev => ({ ...prev, [mode]: prev[mode].filter(a => a.url !== next.url) }));
    } else setExtraReferences(prev => ({ ...prev, [mode]: prev[mode].filter(a => a.url !== asset.url) }));
    if (asset.file) URL.revokeObjectURL(asset.url);
  }, [reference, extraReferences, mode, setReference, currentAssets, prompt, editPrompt]);
  const insertAssetMention = useCallback((tag: string) => { editPrompt(`${prompt}${prompt && !prompt.endsWith(' ') ? ' ' : ''}${tag} `); textareaRef.current?.focus(); }, [prompt, editPrompt]);

  const attachFile = useCallback(async (file: File) => {
    if (mode === 'video' && /\.(mp4|mov)$/i.test(file.name)) {
      if (file.size > 100 * 1024 * 1024) { toast.error(t('creator.fileTooLarge')); return; }
      await addAsset({ url: URL.createObjectURL(file), label: file.name, kind: 'video', file });
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error(t('creator.attachImageReference'));
      return;
    }
    // Reject here rather than after payment: anything past this is staged in
    // storage, and a 40 MB original is slow to upload and pointless as a
    // reference at generation resolutions.
    if (file.size > MAX_REFERENCE_BYTES) {
      toast.error(t('creator.imageTooLarge'));
      return;
    }
    setAttaching(true);
    try {
      const url = await fileToDataUrl(file);
      await addAsset({ url, label: file.name, kind: 'image' });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('creator.attachFailed'));
    } finally {
      setAttaching(false);
    }
  }, [addAsset, mode, t]);

  /** Bring the composer back into view and ready to type, wherever the page is. */
  const focusComposer = useCallback(() => {
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  /**
   * The page's "Pick a medium" tiles live outside the studio. They ask for a
   * mode with a `creator:mode` event, and the composer switches and takes focus.
   */
  useEffect(() => {
    const onPick = (e: Event) => {
      const next = (e as CustomEvent<Mode>).detail;
      if (next === 'image' || next === 'video' || next === 'audio' || next === '3d') {
        setMode(next);
        focusComposer();
      }
    };
    const onWorkflow = (e: Event) => {
      const workflow = (e as CustomEvent<string>).detail;
      setMode('video'); setVideoModel(workflow === 'motion' ? 'kling-3-motion' : 'kling-o3-edit');
      setPresetFor('video', workflow === 'motion' ? 'reference-copy-motion' : 'reference-character-swap');
      focusComposer();
    };
    const onPreset = (e: Event) => {
      const preset = getPreset((e as CustomEvent<string>).detail);
      if (preset?.kind === 'image') {
        setMode('image'); setPresetFor('image', preset.id);
        if (preset.model) setImageModel(preset.model);
        if (preset.aspect) setImageAspect(preset.aspect);
        focusComposer();
      }
    };
    window.addEventListener('creator:preset', onPreset);
    window.addEventListener('creator:workflow', onWorkflow);
    window.addEventListener('creator:mode', onPick);
    return () => { window.removeEventListener('creator:mode', onPick); window.removeEventListener('creator:workflow', onWorkflow); window.removeEventListener('creator:preset', onPreset); };
  }, [focusComposer, setPresetFor]);

  // `/creator?mode=video` (the app's medium tiles link here) opens on that mode.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('mode');
    if (requested === 'image' || requested === 'video' || requested === 'audio' || requested === '3d') setMode(requested);
    const workflow = new URLSearchParams(window.location.search).get('workflow');
    if (workflow === 'swap' || workflow === 'motion') { setMode('video'); setVideoModel(workflow === 'motion' ? 'kling-3-motion' : 'kling-o3-edit'); setPresetFor('video', workflow === 'motion' ? 'reference-copy-motion' : 'reference-character-swap'); }
  }, []);

  // Tell the page's medium tiles which one is live.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('creator:mode-changed', { detail: mode }));
  }, [mode]);

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
      setReferenceFor('video', { url: job.url, label: t('creator.generatedStill') });
      setVideoModel('runway-gen4');
      setPresetFor('video', 'animate-still');
    } else if (job.kind === 'video') {
      if (job.model in VIDEO_MODELS) setVideoModel(job.model as VideoModelKey);
    } else if (job.kind === 'model3d') {
      // Put the original reference back BEFORE the model, or the legality
      // effect sees an empty attachment and swaps in a text-only model at a
      // different price than the one that was paid for.
      if (job.sourceImage) setReferenceFor('3d', { url: job.sourceImage, label: t('creator.originalReference') });
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
    setReferenceFor('3d', { url: job.url, label: t('creator.generatedStill') });
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
    const promptLimit = mode === 'image' ? CREATOR_FAL_IMAGE_MODELS[imageModel]?.maxPromptLength ?? 4000
      : mode === 'video' ? CREATOR_FAL_VIDEO_MODELS[videoModel]?.maxPromptLength : undefined;
    if (promptLimit && resolvedPrompt.length > promptLimit) {
      return `${t('nav.prompt')}: ${resolvedPrompt.length.toLocaleString()} / ${promptLimit.toLocaleString()}`;
    }
    if (mode === 'image') {
      const model = IMAGE_MODELS[imageModel];
      if (currentImages.length > (CREATOR_FAL_IMAGE_MODELS[imageModel]?.maxReferenceImages ?? 4)) return t('creator.referenceTooMany');
      if (currentImages.length > 1 && !CREATOR_FAL_IMAGE_MODELS[imageModel]?.editUsesPlural) return t('creator.referenceMultiModel');
      if (model && reference && !imageModelSupportsEdit(model)) {
        return `${model.name} cannot edit an attached image. Remove it or pick another model.`;
      }
    }
    if (mode === 'video') {
      const model = VIDEO_MODELS[videoModel];
      if (!model) return t('creator.pickVideoModel');
      if (model.requiresVideoInput && !currentClip) return t('creator.referenceNeedsClip');
      if (currentClip && !model.requiresVideoInput) return t('creator.referenceVideoModel');
      if (currentImages.length > (model.maxReferenceImages ?? 1)) return t('creator.referenceTooMany');
      if (model.requiresVideoInput && currentClip?.seconds && currentClip.seconds > (model.maxDuration ?? 15)) return t('creator.referenceClipLength');
      if (!model.supports.includes('image-to-video') && reference) {
        return `${model.name} cannot use a reference image. Remove it or pick another model.`;
      }
      if (!model.supports.includes('text-to-video') && !reference) {
        return `${model.name} needs an image to animate. Attach one first.`;
      }
    }
    if (mode === '3d') {
      const model = MODEL3D_MODELS[model3dModel];
      if (!model) return t('creator.pick3dModel');
      if (!model.supports.includes('text-to-3d') && !reference) {
        return `${model.name} needs an image to work from. Attach one first.`;
      }
    }
    if (mode === 'audio') {
      if (activeAudioTask.needsMedia && !audioFile) {
        return t('creator.taskNeedsFile', { task: t(activeAudioTask.labelKey) });
      }
      if (activeAudioTask.usesVoice && !voiceId) return t('creator.pickVoiceFirst');
      // Caught here rather than at the edge function: two of these tasks are
      // charged for before the call, so an over-length script must fail while
      // it is still free to say no.
      if (activeAudioTask.promptRole !== 'none' && resolvedPrompt.length > MAX_SPEECH_CHARS) {
        return `That is ${resolvedPrompt.length.toLocaleString()} characters. The limit is ${MAX_SPEECH_CHARS.toLocaleString()}.`;
      }
      if (audioTask === 'dialogue' && !parseDialogue(resolvedPrompt, voiceId).length) {
        return t('creator.dialogueFormat');
      }
    }
    return null;
  }, [
    mode,
    imageModel,
    videoModel,
    model3dModel,
    reference,
    currentImages.length,
    currentClip,
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

  const generationQuote = useJobQuote(mode === 'audio'
    ? activeAudioTask.paid && activeAudioTask.quoteModelId ? { kind: 'tool', modelId: activeAudioTask.quoteModelId, quantity: audioUnits } : null
    : mode === 'video' ? { kind: 'video', modelId: videoModel, durationSeconds: duration }
    : mode === '3d' ? { kind: 'model3d', modelId: model3dModel, quality: 'standard' }
    : { kind: 'image', modelId: imageModel, quantity: batch });
  // Free starter images: the server claims one per job, this only decides
  // whether Generate skips the paywall and what the price line says.
  const freeImages = useFreeImages(walletAddress);
  const freeImageEligible = mode === 'image' && batch === 1 && freeImages.remaining > 0 && freeImages.models.includes(imageModel);
  const freeModelSuggestion = mode === 'image' && !freeImageEligible && freeImages.remaining > 0
    ? freeImages.models.find((m) => m in IMAGE_MODELS && m === 'gemini-3.1-flash-image') ?? freeImages.models.find((m) => m in IMAGE_MODELS)
    : undefined;
  const usd = generationQuote.priceUsd;
  /**
   * The price lives inside the Create button. `priceMain` is the headline on
   * the button (DHB, or Free), `priceSub` the dollar estimate beside it, and
   * `priceLabel` the whole sentence for screen readers and the parked pill's
   * tooltip. `priceLoading` draws a shimmer in place of the number.
   */
  const priceIsFree = freeImageEligible || (mode === 'audio' && !activeAudioTask.paid);
  const priceLoading = !priceIsFree && generationQuote.isLoading;
  const priceFailed = !priceIsFree && !priceLoading && !!generationQuote.error;
  const usdText = usd < 0.1 ? usd.toFixed(3) : usd.toFixed(2);
  const priceMain = freeImageEligible ? t('creator.createFreeLeft', { count: freeImages.remaining })
    : priceIsFree ? t('creator.priceFree')
    : priceFailed ? t('creator.priceRetry')
    // Whole tokens with separators up to 100K ("2,150 DHB"), the short form above.
    : t('creator.priceDhbShort', { amount: generationQuote.priceDhb < 100_000 ? Math.round(generationQuote.priceDhb).toLocaleString() : formatDhb(generationQuote.priceDhb) });
  const priceSub = priceIsFree || priceFailed || priceLoading ? null
    : `≈ $${usdText}${mode === '3d' ? ` · ${t('creator.priceStandardTexture')}` : ''}`;
  const priceLabel = freeImageEligible ? t('creator.freeImagesLeft', { count: freeImages.remaining })
    : mode === 'audio' && !activeAudioTask.paid ? t('creator.priceFreeRateLimited')
    : generationQuote.isLoading ? t('creator.priceChecking')
    : generationQuote.error ? t('creator.priceUnavailable')
    : `${t('creator.priceTokensUsd', { amount: formatDhb(generationQuote.priceDhb), usd: usdText })}${mode === '3d' ? ` · ${t('creator.priceStandardTexture')}` : ''}`;

  const audioQuantityLabel = useMemo(() => {
    if (audioTask === 'music') return `${musicSeconds}s track`;
    const seconds = audioFile?.seconds;
    if (seconds == null) return t('creator.lengthUnknown');
    const mins = Math.floor(seconds / 60);
    const rest = Math.round(seconds % 60);
    return mins ? `${mins}m ${rest}s` : `${rest}s`;
  }, [audioTask, musicSeconds, audioFile]);

  /**
   * Queue the chosen audio task.
   *
   * Called directly for free tools, and by the paywall's onConfirm for
   * music. Every setting was chosen before the transfer, so the
   * only thing the modal hands back is the hash of the payment it took — which
   * the generation function needs in order to verify it on chain.
   */
  const runAudio = useCallback((txHash?: string) => {
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
          txHash,
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
      prompt: prompt.trim() || preset?.sample || audioFile?.file.name || t(activeAudioTask.labelKey),
      resolvedPrompt,
      modelName:
        audioTask === 'speech'
          ? (TTS_MODELS[ttsModel]?.name ?? t(activeAudioTask.labelKey))
          : t(activeAudioTask.labelKey),
      presetId: presetId ?? undefined,
      aspect: AUDIO_ASPECT,
    });

    toast.success(
      audioTask === 'dubbing'
        ? t('creator.dubQueued')
        : t('creator.generationStarted'),
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
    if (checkingSession.current) return;
    if (!isAuthenticated) { openLoginModal(); return; }
    if (promptMissing) {
      openComposer();
      return;
    }
    if (blockingIssue) {
      toast.error(blockingIssue);
      return;
    }
    checkingSession.current = true;
    try {
      await apiCall('/api/auth/verify', { requiresAuth: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not verify your session.', error instanceof AuthenticationError ? { action: { label: 'Sign in', onClick: () => openLoginModal() } } : undefined);
      return;
    } finally { checkingSession.current = false; }
    if (mode === 'image' || mode === 'video') {
      setStaging(true);
      try {
        const hosted = await Promise.all(currentAssets.map(async asset => {
          const url = asset.file ? await hostCreatorFile(asset.file) : asset.url.startsWith('data:') ? await hostDataUrl(asset.url) : asset.url;
          return { ...asset, file: undefined, url };
        }));
        currentAssets.forEach(asset => { if (asset.file) URL.revokeObjectURL(asset.url); });
        const primary = hosted.find(a => a.kind === 'image');
        preparedAssetsRef.current = { mode, assets: hosted };
        setReference(primary ?? null);
        setExtraReferences(prev => ({ ...prev, [mode]: hosted.filter(a => a !== primary) }));
      } catch (error) { toast.error(error instanceof Error ? error.message : t('creator.referenceUploadFailed')); return; }
      finally { setStaging(false); }
    }
    if (mode === 'image') {
      if (freeImageEligible) runImageRef.current();
      else setImagePaywallOpen(true);
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
      // Music is paid; the other audio endpoints are free with rate limits.
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
          e instanceof Error ? e.message : t('creator.referenceUploadFailed'),
        );
        return;
      } finally {
        setStaging(false);
      }
    }
    setModel3dPaywallOpen(true);
  }, [
    isAuthenticated,
    openLoginModal,
    promptMissing,
    openComposer,
    blockingIssue,
    mode,
    reference,
    setReferenceFor,
    audioTask,
    activeAudioTask,
    runAudio,
    freeImageEligible,
    currentAssets,
    setReference,
  ]);

  /**
   * Called by the paywall once the DHB transfer confirms, or straight from
   * Generate with no hash when the job runs on a free starter image.
   */
  const runImage = useCallback((txHash?: string) => {
    const assets = preparedAssetsRef.current?.mode === 'image' ? preparedAssetsRef.current.assets : currentAssets;
    const images = assets.filter(a => a.kind === 'image');
    setImagePaywallOpen(false);
    const meta = {
      prompt: prompt.trim() || preset?.sample || t('creator.untitled'),
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
          referenceImageUrls: images.length > 1 ? images.map(a => a.url) : undefined,
          ...(txHash ? { txHash } : { useFree: true }),
          ...(images[0] ? { sourceImage: images[0].url } : {}),
        },
        meta,
      );
    }
    // The claim lands when the request reaches the server; re-read after it.
    if (!txHash) window.setTimeout(() => void freeImages.refetch(), 4000);
    toast.success(batch > 1 ? t('creator.imagesQueued', { count: batch }) : t('creator.generationStarted'));
  }, [prompt, preset, resolvedPrompt, imageModel, imageAspect, batch, reference, extraReferences, presetId, startImage, freeImages]);
  runImageRef.current = runImage;

  const runVideo = useCallback(
    (options: VideoGenerationOptions | undefined, txHash: string) => {
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
          referenceImageUrls: currentImages.length > 1 || activeVideoModel?.referenceMode === 'edit' ? currentImages.map(a => a.url) : options?.referenceImageUrls,
          endFrameUrl: options?.endFrameUrl,
          audioUrls: options?.audioUrls,
          videoUrls: currentClip ? [currentClip.url] : options?.videoUrls,
          seed: options?.seed,
          txHash,
          ...(reference ? { sourceImage: reference.url } : {}),
        },
        {
          prompt: prompt.trim() || preset?.sample || t('creator.untitled'),
          resolvedPrompt,
          modelName: VIDEO_MODELS[videoModel]?.name ?? videoModel,
          presetId: presetId ?? undefined,
          aspect: videoAspect,
        },
      );
      toast.success(t('creator.renderQueued'));
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
      currentClip,
      currentImages,
    ],
  );

  /** Called by the paywall once the DHB transfer confirms. */
  const run3d = useCallback(
    (options: Model3dGenerationOptions | undefined, txHash: string) => {
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
          txHash,
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
      toast.success(t('creator.meshQueued'));
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
            meta: `$${(Math.ceil(getImageCostUsd(m) / 0.001) * 0.001).toFixed(3)}`,
            disabled: (!canEdit && !!reference) || (currentImages.length > 1 && !CREATOR_FAL_IMAGE_MODELS[m.id]?.editUsesPlural) || currentImages.length > (CREATOR_FAL_IMAGE_MODELS[m.id]?.maxReferenceImages ?? 4),
            disabledReason: t('creator.cannotEditAttached'),
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
            disabledReason: t('creator.needsAttachedImage'),
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
            disabled: (needsImage && !reference && !m.requiresVideoInput) || (rejectsImage && !!reference),
            disabledReason: t(needsImage ? 'creator.needsAttachedImage' : 'creator.cannotUseAttached'),
          };
        });

  const selectedModel = mode === 'image' ? imageModel : mode === '3d' ? model3dModel : mode === 'audio' ? ttsModel : videoModel;
  const modelDisplay = modelOptions.find(option => option.value === selectedModel)?.label.split(/\s+/)[0];

  /** The nine audio tools, priced where they cost anything. */
  // Named `task`, not `t` — `t` is the translator in this scope.
  const audioTaskOptions: ChipOption<string>[] = AUDIO_TASK_OPTIONS.map((task) => ({
    value: task.id,
    label: t(task.labelKey),
    detail: t(task.descriptionKey),
    meta: task.paid ? t('creator.fromPrice', { price: getAudioCostUsd(task, 1).toFixed(2) }) : t('creator.free'),
  }));

  const languageOptions: ChipOption<string>[] = AUDIO_LANGUAGES.map((l) => ({
    value: l.code,
    label: l.label,
  }));

  const aspectOptions: ChipOption<string>[] = (mode === 'image' ? creatorFalImageAspects(imageModel) : videoAspects).map(
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
            t(activeAudioTask.labelKey)
          : activeVideoModel?.name ?? videoModel;

  const placeholder = preset
    ? t('creator.presetPlaceholder', { name: t(preset.nameKey), sample: preset.sample })
    : mode === 'image'
      ? t('creator.placeholderImage')
      : mode === '3d'
        ? t('creator.placeholder3d')
        : mode === 'audio'
          ? t(activeAudioTask.placeholderKey)
          : t('creator.placeholderVideo');

  const generateDisabled = promptMissing || !!blockingIssue || staging;
  const undoEnhance = beforeEnhance[mode];

  /** Prompt assist: expands a terse idea into a fuller prompt, keeping the
      subject. Always undoable, so it cannot eat what was typed. */
  const enhanceButton = (compact?: boolean) => (
    <button
      type="button"
      onClick={() => void enhance()}
      disabled={!prompt.trim() || enhancing}
      aria-label={t('creator.expandPrompt')}
      title={t('creator.expandPrompt')}
      className={cn(
        'shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white/70 backdrop-blur-xl transition hover:border-white/40 hover:bg-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40',
        compact ? 'hidden h-8 w-8 sm:inline-flex' : 'inline-flex h-[34px] w-[34px]',
      )}
    >
      {enhancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
    </button>
  );

  /**
   * Create, with the price built in. The full button carries a shining DHB
   * coin, the word Create and the price under it; the parked pill keeps the
   * coin and the DHB figure so the cost is never out of sight.
   */
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
      aria-label={`${t(staging ? 'creator.preparing' : 'creator.create')}, est 2-5 mins, ${priceLabel}`}
      title={compact ? (blockingIssue ?? priceLabel) : undefined}
      data-creator-create
      className={cn(
        'relative inline-flex shrink-0 items-center font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
        compact ? 'h-9 gap-1.5 rounded-xl pl-1.5 pr-3' : 'h-[64px] min-w-0 flex-1 gap-3 rounded-[20px] pl-2 pr-2 sm:min-w-[300px] sm:flex-none',
        generateDisabled ? 'cursor-not-allowed opacity-55 saturate-50' : 'hover:brightness-110 active:scale-[0.99]',
      )}
      style={{
        backgroundImage: 'var(--cr-accent)',
        color: 'var(--cr-accent-ink)',
        boxShadow: generateDisabled ? 'inset 0 1px 0 rgba(255,255,255,0.45)' : '0 10px 34px -10px var(--cr-glow), inset 0 1px 0 rgba(255,255,255,0.45)',
      }}
    >
      <span
        data-creator-coin={generateDisabled ? undefined : ''}
        className={cn(
          'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-black/15 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]',
          compact ? 'h-6 w-6' : 'h-12 w-12',
        )}
      >
        {staging ? (
          <Loader2 className={cn('animate-spin', compact ? 'h-3.5 w-3.5' : 'h-5 w-5')} />
        ) : (
          <img src={dehubCoin} alt="" className={compact ? 'h-6 w-6' : 'h-10 w-10'} draggable={false} />
        )}
      </span>
      {compact ? (
        <span className="text-[13px] tabular-nums">
          {priceLoading ? <span className="inline-block h-3 w-10 animate-pulse rounded bg-black/20 align-middle" /> : priceMain}
        </span>
      ) : (
        <>
          <span className="grid min-w-0 text-left leading-none">
            <span className="flex items-baseline gap-2 whitespace-nowrap">
              <span className="font-exo text-[19px] font-black tracking-tight">{t(staging ? 'creator.preparing' : 'creator.create')}</span>
              <span className="text-[11px] font-semibold opacity-75">est 2-5 mins</span>
            </span>
            <span aria-hidden className="mt-1.5 truncate text-[12px] font-semibold tabular-nums opacity-80 sm:text-[12.5px]">
              {priceLoading
                ? <span className="inline-block h-2.5 w-24 animate-pulse rounded bg-black/20 align-middle" />
                : priceSub ? `${priceMain} · ${priceSub}` : priceMain}
            </span>
          </span>
          <span aria-hidden className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.3)]">
            <ArrowRight className="h-5 w-5" />
          </span>
        </>
      )}
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
      {/* Token Stage hero: a centred headline over the page's wall of
          community work (drawn by CreatorPage behind this section). */}
      <section className="relative px-3 pb-4 pt-5 text-center sm:px-4 sm:pb-6 sm:pt-16">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] py-1 pl-1 pr-3 text-[12.5px] font-semibold text-white/85 backdrop-blur-xl">
          <ThemedIcon icon="features" className="h-6 w-6 object-contain" />
          {t('creator.heroKicker', { model: currentModelName })}
        </span>
        <h2 className="mx-auto mt-4 max-w-3xl text-balance font-exo text-[34px] font-black leading-[1.02] tracking-tight text-white sm:text-[56px]">
          {t('creator.heroTitle')}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-[14px] text-white/60 sm:text-base">
          {t('creator.heroSubtitle')}
        </p>
        {runningCount > 0 && (
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[12px] font-medium text-white/75 backdrop-blur-xl">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t('creator.countRunning', { count: runningCount })}
          </span>
        )}
      </section>


      {/* Horizontal padding only. Padding or a margin on the top edge would
          ride along when it parks, leaving a transparent strip between the
          header and the composer with the page scrolling through it. */}
      <div className="z-40 px-3 sm:sticky sm:px-4" style={{ top: stickyTop }}>
        <div
          ref={composerRef}
          data-creator-composer
          className="mx-auto max-w-[1040px] rounded-[26px] border border-white/15 bg-white/[0.06] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-xl"
        >
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
                        ? t('creator.lengthUnreadable')
                        : `${audioQuantityLabel}${activeAudioTask.paid ? ' — billed on this' : ''}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAudioFile(null)}
                    aria-label={t('creator.removeAttachedFile')}
                    className="rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {mode !== 'audio' && <ReferenceAssets assets={currentAssets} onAdd={asset => void addAsset(asset)} onRemove={removeAsset} onMention={insertAssetMention} allowVideo={mode === 'video'} singleImage={mode === '3d'} libraryOpen={referenceLibraryOpen} onLibraryOpenChange={setReferenceLibraryOpen} />}
              {mode === 'video' && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {(['swap', 'motion'] as const).map(workflow => <button key={workflow} type="button"
                    aria-pressed={videoModel === (workflow === 'swap' ? 'kling-o3-edit' : 'kling-3-motion')}
                    onClick={() => { setVideoModel(workflow === 'swap' ? 'kling-o3-edit' : 'kling-3-motion'); setPresetId(workflow === 'swap' ? 'reference-character-swap' : 'reference-copy-motion'); }}
                    className="rounded-lg border border-white/20 px-3 py-2 text-xs text-white/80">{t(workflow === 'swap' ? 'creator.characterSwap' : 'creator.copyMotion')}</button>)}
                </div>
              )}

              <div className="flex items-start gap-2">
                {activeAudioTask.promptRole === 'none' && mode === 'audio' ? (
                  // Nothing to type for these four: the upload IS the input, so
                  // the box is replaced by what to do rather than left empty
                  // with a placeholder nobody can act on.
                  <p className="flex min-h-[3.25rem] flex-1 items-center text-[14px] text-white/45">
                    {audioFile
                      ? t('creator.readyToProcess', { task: t(activeAudioTask.labelKey).toLowerCase() })
                      : t('creator.attachRecordingToStart')}
                  </p>
                ) : (
                  <>
                    <label htmlFor="studio-prompt" className="sr-only">
                      {t('creator.promptLabel')}
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
                      className="min-h-[3.25rem] min-w-0 flex-1 resize-y bg-transparent py-1 text-[16px] leading-relaxed text-white outline-none placeholder:text-white/35 sm:text-[15px]"
                    />
                  </>
                )}
                {enhanceButton()}
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

              {/* Compact primary controls share a row; additional tools can wrap. */}
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {/* Sound effects, music and voice design have nothing to attach
                    — offering a paperclip there is a control that can only
                    produce an error. */}
                {(mode !== 'audio' || activeAudioTask.needsMedia) && (
                  <DropdownMenu open={attachmentMenuOpen} onOpenChange={setAttachmentMenuOpen}>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        disabled={attaching}
                        aria-label={
                          t(mode === 'audio' ? 'creator.attachRecording' : 'creator.attachReferenceImage')
                        }
                        className="shrink-0 rounded-xl border border-white/15 bg-white/[0.06] p-1.5 text-white/70 transition hover:border-white/30 hover:bg-white/[0.12] hover:text-white disabled:opacity-40"
                      >
                        {attaching ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Paperclip className="h-4 w-4" />
                        )}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {mode !== 'audio' && <DropdownMenuItem onSelect={() => setReferenceLibraryOpen(true)}>{t('creator.referenceLibrary')}</DropdownMenuItem>}
                      <DropdownMenuItem onSelect={() => fileRef.current?.click()}>{t('creator.referenceUpload')}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <ModeToggle mode={mode} onChange={switchMode} compact />

                <div className="contents">
                  {/* Audio leads with the tool, not the engine: which of the
                      nine is running decides every other chip on the rail. */}
                  {mode === 'audio' && (
                    <SelectChip
                      label={t('creator.tool')}
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
                      label={t('creator.model')}
                      width="md"
                      searchable
                      searchPlaceholder={t('creator.searchModels')}
                      display={modelDisplay}
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
                  {/* Clip workflows retain the source clip's framing. */}
                  {(mode === 'image' || (mode === 'video' && !activeVideoModel?.requiresVideoInput)) && (
                    <SelectChip
                      label={t('creator.aspectRatio')}
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
                            label={t('creator.delivery')}
                            value={String(stability)}
                            display={
                              t(stability <= 0.35 ? 'creator.expressive' : stability >= 0.7 ? 'creator.consistent' : 'creator.natural')
                            }
                            options={[
                              {
                                value: '0.3',
                                label: t('creator.expressive'),
                                detail: t('creator.expressiveDetail'),
                              },
                              { value: '0.5', label: t('creator.natural'), detail: t('creator.naturalDetail') },
                              {
                                value: '0.75',
                                label: t('creator.consistent'),
                                detail: t('creator.consistentDetail'),
                              },
                            ]}
                            onChange={(v) => setStability(Number(v))}
                          />
                          <SelectChip
                            label={t('creator.style')}
                            value={String(style)}
                            display={t(style <= 0.1 ? 'creator.styleNone' : style >= 0.6 ? 'creator.styleHeavy' : 'creator.styleSome')}
                            options={[
                              { value: '0', label: t('creator.styleNone'), detail: t('creator.styleNoneDetail') },
                              { value: '0.3', label: t('creator.styleSome'), detail: t('creator.styleSomeDetail') },
                              {
                                value: '0.7',
                                label: t('creator.styleHeavy'),
                                detail: t('creator.styleHeavyDetail'),
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
                          label={t('creator.pace')}
                          value={String(speed)}
                          display={t(speed < 1 ? 'creator.slower' : speed > 1 ? 'creator.faster' : 'creator.normal')}
                          options={[
                            { value: '0.85', label: t('creator.slower') },
                            { value: '1', label: t('creator.normal') },
                            { value: '1.15', label: t('creator.faster') },
                          ]}
                          onChange={(v) => setSpeed(Number(v))}
                        />
                      )}

                      {audioTask === 'speech' && (
                        <SelectChip
                          label={t('creator.language')}
                          searchable
                          searchPlaceholder={t('creator.searchLanguages')}
                          value={speechLang}
                          display={
                            AUDIO_LANGUAGES.find((l) => l.code === speechLang)?.label ?? t('creator.auto')
                          }
                          options={[
                            {
                              value: '',
                              label: t('creator.auto'),
                              detail: t('creator.autoDetectLanguage'),
                            },
                            ...languageOptions,
                          ]}
                          onChange={setSpeechLang}
                        />
                      )}

                      {audioTask === 'sfx' && (
                        <>
                          <SelectChip
                            label={t('creator.length')}
                            value={String(sfxSeconds)}
                            display={sfxSeconds ? `${sfxSeconds}s` : t('creator.auto')}
                            options={[
                              { value: '0', label: t('creator.auto'), detail: t('creator.autoLetModelChoose') },
                              { value: '2', label: '2s' },
                              { value: '5', label: '5s' },
                              { value: '10', label: '10s' },
                              { value: '22', label: '22s' },
                              { value: '30', label: '30s', detail: t('creator.maximum') },
                            ]}
                            onChange={(v) => setSfxSeconds(Number(v))}
                          />
                          <SelectChip
                            label={t('creator.followPrompt')}
                            value={String(promptInfluence)}
                            display={
                              promptInfluence >= 0.7
                                ? t('creator.literally')
                                : promptInfluence <= 0.2
                                  ? t('creator.loosely')
                                  : t('creator.balanced')
                            }
                            options={[
                              { value: '0.1', label: t('creator.loosely'), detail: t('creator.looselyDetail') },
                              { value: '0.3', label: t('creator.balanced') },
                              { value: '0.8', label: t('creator.literally'), detail: t('creator.literallyDetail') },
                            ]}
                            onChange={(v) => setPromptInfluence(Number(v))}
                          />
                          <ToggleChip
                            label={t('creator.loop')}
                            active={loopSfx}
                            onClick={() => setLoopSfx((v) => !v)}
                          />
                        </>
                      )}

                      {audioTask === 'music' && (
                        <>
                          <SelectChip
                            label={t('creator.length')}
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
                            label={t('creator.instrumental')}
                            active={instrumental}
                            onClick={() => setInstrumental((v) => !v)}
                          />
                        </>
                      )}

                      {audioTask === 'dubbing' && (
                        <SelectChip
                          label={t('creator.dubInto')}
                          searchable
                          searchPlaceholder={t('creator.searchLanguages')}
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
                      draftScope={`creator:batch:${imageModel}`}
                      label={t('creator.imagesUnit')}
                      singular={t('creator.imageUnit')}
                      value={batch}
                      min={1}
                      max={MAX_IMAGE_BATCH}
                      onChange={setBatch}
                    />
                  )}

                  {mode === 'video' && (
                    <>
                      {activeVideoModel?.requiresVideoInput ? <span className="rounded-xl border border-white/15 px-3 py-2 text-xs text-white/65">{t('creator.referenceClipSeconds', { seconds: duration })}</span> : <CounterChip
                        draftScope={`creator:duration:${videoModel}`}
                        label={t('creator.secondsUnit')}
                        singular={t('creator.secondUnit')}
                        displayUnit="s"
                        value={duration}
                        min={activeVideoModel?.minDuration ?? 5}
                        max={activeVideoModel?.maxDuration ?? 10}
                        editable
                        allowedValues={activeVideoModel?.allowedDurations}
                        onChange={setDuration}
                      />}
                      {activeVideoModel?.supportsResolution && (
                        <SelectChip
                          label={t('creator.resolution')}
                          value={resolution}
                          options={videoResolutions.map((r) => ({
                            value: r,
                            label: r,
                            detail:
                              r === '480p'
                                ? t('creator.fastest')
                                : r === '720p'
                                  ? t('creator.balanced')
                                  : t('creator.highestQuality'),
                          }))}
                          onChange={(v) => setResolution(v as Resolution)}
                        />
                      )}
                    </>
                  )}
                </div>

                {/* Its own row on a phone, so Create and its price get the full width. */}
                <div className="flex w-full items-end gap-2 sm:w-auto">
                  {generateButton()}
                </div>
              </div>

              <p aria-live="polite" className="sr-only">{priceLabel}</p>
              {freeModelSuggestion && (
                <button
                  type="button"
                  onClick={() => { setImageModel(freeModelSuggestion as ImageModelKey); setBatch(1); }}
                  className="mt-1 px-1 text-left text-[12px] font-medium text-white underline underline-offset-2 hover:text-white/80"
                >
                  {t('creator.useFreeModel', { count: freeImages.remaining, model: IMAGE_MODELS[freeModelSuggestion]?.name ?? freeModelSuggestion })}
                </button>
              )}
              {blockingIssue && (
                <p id="studio-blocking-reason" className="mt-2 px-1 text-[12px] text-white/45">
                  {blockingIssue}
                </p>
              )}
          </>
        </div>
      </div>

      <section className="px-3 pb-6 sm:px-4">
        {/* One input for both channels. The accept list and the handler follow
            the mode, so the picker offers recordings on the audio tasks that
            take one and pictures everywhere else. */}
        <input
          ref={fileRef}
          type="file"
          multiple={mode === 'image' || mode === 'video'}
          accept={mode === 'audio' ? (activeAudioTask.mediaAccept ?? 'audio/*') : mode === 'video' ? 'image/*,video/mp4,video/quicktime,.mp4,.mov' : 'image/*'}
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            void (async () => { for (const file of files) await (mode === 'audio' ? attachAudioFile(file) : attachFile(file)); })();
            e.target.value = '';
          }}
        />

        <div className="mt-5">
          <GenerationExample kind={mode} model={mode === 'video' ? videoModel : undefined} />
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

        {/* Only music requires the payment dialog; other audio tools run directly. */}
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
});

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
