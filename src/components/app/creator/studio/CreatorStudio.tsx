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
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Film,
  ImageIcon,
  Loader2,
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
  type ImageModelKey,
} from '@/constants/image-models.constants';
import {
  VIDEO_MODELS,
  VIDEO_MODEL_OPTIONS,
  getVideoCostUsd,
  type VideoModelKey,
} from '@/constants/video-models.constants';
import { ImagePaywallModal } from '@/components/app/image/ImagePaywallModal';
import {
  VideoPaywallModal,
  type VideoGenerationOptions,
} from '@/components/app/video/VideoPaywallModal';
import { applyPreset, getPreset, type CreatorPreset } from '@/lib/creator/presets';
import { enhancePrompt } from '@/lib/creator/generationEngine';
import { useGenerationStore, type GenerationJob } from '@/store/generationStore';
import { useCloseOnSurfaceSwitch, useSurfaceEpoch } from '@/hooks/use-surface-switch';
import { CounterChip, SelectChip, type ChipOption } from './StudioChip';
import { PresetStrip } from './PresetStrip';
import { ResultsFeed } from './ResultsFeed';

type Mode = 'image' | 'video';

const IMAGE_ASPECTS = ['1:1', '4:5', '16:9', '9:16', '3:2', '2:3', '21:9'] as const;
const MAX_IMAGE_BATCH = 4;
const MAX_REFERENCE_BYTES = 20 * 1024 * 1024;

const MODES: { id: Mode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'image', label: 'Image', icon: ImageIcon },
  { id: 'video', label: 'Video', icon: Film },
];

/** Read a picked file as a data URL for the reference-image channel. */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.readAsDataURL(file);
  });
}

interface CreatorStudioProps {
  /** Switches the host to /editor after a result is sent to the timeline. */
  onOpenEditor: () => void;
}

export function CreatorStudio({ onOpenEditor }: CreatorStudioProps) {
  const { walletAddress, isAuthenticated } = useAuth() as {
    walletAddress: string | null;
    isAuthenticated: boolean;
  };

  const startImage = useGenerationStore((s) => s.startImage);
  const startVideo = useGenerationStore((s) => s.startVideo);
  const runningCount = useGenerationStore((s) => s.jobs.filter((j) => j.status === 'running').length);

  const [mode, setMode] = useState<Mode>('image');
  const [prompt, setPrompt] = useState('');
  const [presetId, setPresetId] = useState<string | null>(null);

  const [imageModel, setImageModel] = useState<ImageModelKey>('gemini-3-pro-image');
  const [videoModel, setVideoModel] = useState<VideoModelKey>('kling-2.6-pro');
  const [imageAspect, setImageAspect] = useState<string>('1:1');
  const [videoAspect, setVideoAspect] = useState<string>('16:9');
  const [batch, setBatch] = useState(1);

  /** Reference image: an upload, or a still handed over by "Animate this". */
  const [reference, setReference] = useState<{ url: string; label: string } | null>(null);

  const [imagePaywallOpen, setImagePaywallOpen] = useState(false);
  const [videoPaywallOpen, setVideoPaywallOpen] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  /** Pre-enhance text, so the wand is always undoable. */
  const [beforeEnhance, setBeforeEnhance] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  // Paywalls are Radix dialogs, portalled outside the host's hidden wrapper.
  useCloseOnSurfaceSwitch(
    useCallback(() => {
      setImagePaywallOpen(false);
      setVideoPaywallOpen(false);
    }, []),
  );
  const surfaceEpoch = useSurfaceEpoch();

  const preset = getPreset(presetId);
  const activeVideoModel = VIDEO_MODELS[videoModel];
  const activeImageModel = IMAGE_MODELS[imageModel];

  /** Video models differ on what they accept; the rail follows the chosen one. */
  const videoAspects = activeVideoModel?.aspectRatios ?? ['16:9', '9:16', '1:1'];
  const [duration, setDuration] = useState(activeVideoModel?.defaultDuration ?? 5);
  const [resolution, setResolution] = useState<'480p' | '720p' | '1080p'>('720p');

  // Keep duration and aspect legal whenever the model changes.
  useEffect(() => {
    const model = VIDEO_MODELS[videoModel];
    if (!model) return;
    setDuration((d) =>
      Math.min(model.maxDuration ?? 10, Math.max(model.minDuration ?? 5, model.defaultDuration ?? d)),
    );
    const allowed = model.aspectRatios ?? ['16:9', '9:16', '1:1'];
    setVideoAspect((a) => (allowed.includes(a) ? a : allowed[0]));
  }, [videoModel]);

  const aspect = mode === 'image' ? imageAspect : videoAspect;
  const resolvedPrompt = useMemo(() => applyPreset(preset, prompt), [preset, prompt]);

  /** Applying a preset also adopts the model and aspect it was tuned for. */
  const pickPreset = useCallback((next: CreatorPreset | null) => {
    setPresetId(next?.id ?? null);
    if (!next) return;
    if (next.kind === 'image') {
      if (next.model && next.model in IMAGE_MODELS) setImageModel(next.model as ImageModelKey);
      if (next.aspect) setImageAspect(next.aspect);
    } else {
      if (next.model && next.model in VIDEO_MODELS) setVideoModel(next.model as VideoModelKey);
      if (next.aspect) setVideoAspect(next.aspect);
    }
    textareaRef.current?.focus();
  }, []);

  // Switching mode drops a preset that belongs to the other mode.
  const switchMode = useCallback(
    (next: Mode) => {
      setMode(next);
      const current = getPreset(presetId);
      if (current && current.kind !== next) setPresetId(null);
    },
    [presetId],
  );

  const enhance = useCallback(async () => {
    const current = prompt.trim();
    if (!current || enhancing) return;
    setEnhancing(true);
    try {
      const next = await enhancePrompt(current, mode);
      if (next && next !== current) {
        setBeforeEnhance(current);
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
  }, [prompt, enhancing, mode]);

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
  }, []);

  /** "Animate this" on an image result, and "load into composer" on a failure. */
  const loadJob = useCallback((job: GenerationJob) => {
    setPrompt(job.prompt);
    setPresetId(job.presetId ?? null);
    if (job.kind === 'image' && job.status === 'done' && job.url) {
      setMode('video');
      setReference({ url: job.url, label: 'Generated still' });
      setVideoModel('runway-gen4');
      setPresetId('animate-still');
    } else if (job.kind === 'video') {
      setMode('video');
      if (job.model in VIDEO_MODELS) setVideoModel(job.model as VideoModelKey);
    } else {
      setMode('image');
      if (job.model in IMAGE_MODELS) setImageModel(job.model as ImageModelKey);
    }
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    textareaRef.current?.focus();
  }, []);

  /** Guardrails that would otherwise only surface as a paid-for failure. */
  const blockingIssue = useMemo(() => {
    if (!resolvedPrompt.trim()) return 'Describe what you want first.';
    if (!isAuthenticated) return 'Sign in to generate.';
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
    return null;
  }, [resolvedPrompt, isAuthenticated, mode, videoModel, reference]);

  const openPaywall = useCallback(() => {
    if (blockingIssue) {
      toast.error(blockingIssue);
      return;
    }
    if (mode === 'image') setImagePaywallOpen(true);
    else setVideoPaywallOpen(true);
  }, [blockingIssue, mode]);

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

  const modelOptions: ChipOption<string>[] =
    mode === 'image'
      ? IMAGE_MODEL_OPTIONS.map((m) => ({
          value: m.id,
          label: m.name,
          detail: m.description,
          meta: `$${getImageCostUsd(m).toFixed(2)}`,
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

  const aspectOptions: ChipOption<string>[] = (mode === 'image' ? [...IMAGE_ASPECTS] : videoAspects).map(
    (a) => ({ value: a, label: a }),
  );

  const currentModelName =
    mode === 'image' ? activeImageModel?.name ?? imageModel : activeVideoModel?.name ?? videoModel;

  return (
    <section className="px-3 pb-6 pt-5 sm:px-4">
      {/* Mode rail */}
      <div className="mb-5 flex items-center justify-between gap-3">
        {/* Toggle buttons, not ARIA tabs: there is no tabpanel to control and
            no arrow-key navigation, so aria-pressed is the honest semantic. */}
        <div
          role="group"
          aria-label="What to create"
          className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur-xl"
        >
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={active}
                onClick={() => switchMode(m.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-semibold transition',
                  active
                    ? 'bg-white text-black'
                    : 'text-white/60 hover:bg-white/10 hover:text-white',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {m.label}
              </button>
            );
          })}
        </div>

        {runningCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[12px] font-medium text-white/75 backdrop-blur-xl">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {runningCount} running
          </span>
        )}
      </div>

      <h2 className="text-2xl font-black uppercase leading-[1.05] tracking-tight text-white sm:text-3xl">
        Start creating with {currentModelName}
      </h2>
      <p className="mt-1.5 max-w-xl text-sm text-white/45">
        Describe a scene, character, mood or style. Results land below and carry straight into the
        editor.
      </p>

      {/* Composer */}
      <div
        ref={composerRef}
        className="mt-4 rounded-2xl border border-white/12 bg-white/[0.04] p-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-xl"
      >
        {reference && (
          <div className="mb-2 flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/40 p-2">
            <img
              src={reference.url}
              alt=""
              className="h-11 w-11 shrink-0 rounded-lg object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-white/85">{reference.label}</p>
              <p className="text-[11px] text-white/40">
                {mode === 'image' ? 'Used as an edit reference' : 'First frame to animate'}
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
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={attaching}
            aria-label="Attach a reference image"
            className="mt-0.5 shrink-0 rounded-xl border border-white/15 bg-white/[0.06] p-2.5 text-white/70 transition hover:border-white/30 hover:bg-white/[0.12] hover:text-white disabled:opacity-40"
          >
            {attaching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void attachFile(file);
              e.target.value = '';
            }}
          />

          <label htmlFor="studio-prompt" className="sr-only">
            Prompt
          </label>
          <textarea
            id="studio-prompt"
            ref={textareaRef}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              // Editing by hand makes the pre-enhance snapshot stale, so retire
              // the undo rather than let it revert to something unexpected.
              if (beforeEnhance !== null) setBeforeEnhance(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                openPaywall();
              }
            }}
            rows={2}
            placeholder={
              preset
                ? `${preset.name}: describe the subject, for example "${preset.sample}"`
                : mode === 'image'
                  ? 'Describe the image you want'
                  : 'Describe the shot you want'
            }
            className="min-h-[3.25rem] w-full resize-y bg-transparent py-2 text-[15px] leading-relaxed text-white outline-none placeholder:text-white/35"
          />

          {/* Prompt assist: expands a terse idea into a fuller prompt, keeping
              the subject. Always undoable, so it cannot eat what was typed. */}
          <button
            type="button"
            onClick={() => void enhance()}
            disabled={!prompt.trim() || enhancing}
            aria-label="Expand this prompt with more detail"
            title="Expand this prompt with more detail"
            className="mt-0.5 shrink-0 rounded-xl border border-white/20 bg-white/10 p-2.5 text-white/70 backdrop-blur-xl transition hover:border-white/40 hover:bg-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {enhancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          </button>
        </div>

        {beforeEnhance !== null && (
          <div className="mt-1 flex items-center gap-2 px-1">
            <span className="text-[11px] text-white/45">Prompt expanded.</span>
            <button
              type="button"
              onClick={() => {
                setPrompt(beforeEnhance);
                setBeforeEnhance(null);
              }}
              className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white/70 underline-offset-2 transition hover:bg-white/10 hover:text-white hover:underline"
            >
              Undo
            </button>
          </div>
        )}

        {/* Settings rail */}
        <div className="mt-1.5 flex items-end gap-2">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <SelectChip
              label="Model"
              width="md"
              value={mode === 'image' ? imageModel : videoModel}
              options={modelOptions}
              onChange={(v) =>
                mode === 'image'
                  ? setImageModel(v as ImageModelKey)
                  : setVideoModel(v as VideoModelKey)
              }
            />
            <SelectChip
              label="Aspect ratio"
              value={aspect}
              options={aspectOptions}
              onChange={(v) => (mode === 'image' ? setImageAspect(v) : setVideoAspect(v))}
            />

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
                <CounterChip
                  label="seconds"
                  singular="second"
                  value={duration}
                  min={activeVideoModel?.minDuration ?? 5}
                  max={activeVideoModel?.maxDuration ?? 10}
                  onChange={setDuration}
                />
                {activeVideoModel?.supportsResolution && (
                  <SelectChip
                    label="Resolution"
                    value={resolution}
                    options={[
                      { value: '480p', label: '480p', detail: 'Fastest' },
                      { value: '720p', label: '720p', detail: 'Balanced' },
                      { value: '1080p', label: '1080p', detail: 'Highest quality' },
                    ]}
                    onChange={(v) => setResolution(v as '480p' | '720p' | '1080p')}
                  />
                )}
              </>
            )}
          </div>

          {/* Kept focusable rather than disabled: a disabled button leaves the
              tab order, so its aria-describedby reason could never be read and
              a keyboard user got no explanation at all. It stays styled as
              unavailable and explains itself on activation instead. */}
          <button
            type="button"
            onClick={openPaywall}
            aria-disabled={!!blockingIssue}
            aria-describedby={blockingIssue ? 'studio-blocking-reason' : undefined}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 rounded-xl border px-5 py-2.5 text-[13px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
              blockingIssue
                ? 'cursor-not-allowed border-white/20 bg-white/10 text-white/70'
                : 'border-white/25 bg-white text-black hover:bg-white/90',
            )}
          >
            <Sparkles className="h-4 w-4" />
            Generate
          </button>
        </div>

        {blockingIssue && (
          <p id="studio-blocking-reason" className="mt-2 px-1 text-[12px] text-white/45">
            {blockingIssue}
          </p>
        )}
      </div>

      <div className="mt-5">
        <PresetStrip kind={mode} activeId={presetId} onPick={pickPreset} />
      </div>

      <div className="mt-7">
        <ResultsFeed wallet={walletAddress} onAnimate={loadJob} onOpenEditor={onOpenEditor} />
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
    </section>
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
