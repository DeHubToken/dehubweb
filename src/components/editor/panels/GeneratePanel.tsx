/**
 * Generate panel.
 * ===============
 * Generation inside the editor, on the same engine and queue as the /creator
 * studio. The previous version hard-coded the video model id `kling-v2-master`,
 * which the generate-video edge function rejects outright, so every video
 * generation started from the editor failed with "Invalid model". It also
 * offered no model choice at all.
 *
 * Video and image generation are charged in DHB, so both go through the same
 * paywall modals the studio uses. Voiceover runs on the storage quota, which is
 * why it generates directly.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Film, ImageIcon, Loader2, Mic, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useEditorQuota } from '@/hooks/use-editor-quota';
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
import { DEFAULT_VOICE_ID, generateAudio } from '@/lib/creator/generationEngine';
import { importOneFile } from '@/lib/editor/importFiles';
import { useGenerationStore } from '@/store/generationStore';
import { useEditorUiStore } from '@/store/editorUiStore';
import { useCloseOnSurfaceSwitch, useSurfaceEpoch } from '@/hooks/use-surface-switch';
import { SelectChip, type ChipOption } from '@/components/app/creator/studio/StudioChip';
import { PanelHeading } from './DesignPanel';

type GenKind = 'image' | 'video' | 'voice';

const KINDS: { id: GenKind; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'image', label: 'Image', icon: ImageIcon },
  { id: 'video', label: 'Video', icon: Film },
  { id: 'voice', label: 'Voice', icon: Mic },
];

const MAX_VOICE_CHARS = 500;

export function GeneratePanel() {
  const quota = useEditorQuota();
  const { isAuthenticated } = useAuth() as { isAuthenticated: boolean };
  const startImage = useGenerationStore((s) => s.startImage);
  const startVideo = useGenerationStore((s) => s.startVideo);
  const setPanel = useEditorUiStore((s) => s.setPanel);

  const [kind, setKind] = useState<GenKind>('image');
  const [prompt, setPrompt] = useState('');
  const [imageModel, setImageModel] = useState<ImageModelKey>('gemini-3-pro-image');
  const [videoModel, setVideoModel] = useState<VideoModelKey>('kling-2.6-pro');
  // Separate ratios per mode. One shared value could carry a 4:5 image ratio
  // into a video model that only accepts 16:9 / 9:16 / 1:1, and the chip would
  // happily display it while no option was checked.
  const [imageAspect, setImageAspect] = useState('16:9');
  const [videoAspect, setVideoAspect] = useState('16:9');
  const [imagePaywallOpen, setImagePaywallOpen] = useState(false);
  const [videoPaywallOpen, setVideoPaywallOpen] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);

  const activeImageModel = IMAGE_MODELS[imageModel];
  const activeVideoModel = VIDEO_MODELS[videoModel];
  const videoAspects = useMemo(
    () => activeVideoModel?.aspectRatios ?? ['16:9', '9:16', '1:1'],
    [activeVideoModel],
  );
  const aspect = kind === 'video' ? videoAspect : imageAspect;

  // Keep the video ratio legal when the model changes.
  useEffect(() => {
    setVideoAspect((a) => (videoAspects.includes(a) ? a : videoAspects[0]));
  }, [videoAspects]);

  // Paywalls are portalled to document.body, outside the co-mounted host's
  // hidden wrapper, so they have to be closed explicitly on a surface switch.
  useCloseOnSurfaceSwitch(
    useCallback(() => {
      setImagePaywallOpen(false);
      setVideoPaywallOpen(false);
    }, []),
  );
  const surfaceEpoch = useSurfaceEpoch();

  const blockingIssue = useMemo(() => {
    if (!prompt.trim()) return null;
    if (quota.overQuota) return 'Storage is full. Remove assets or stake more DHB.';
    // Voice is not charged in DHB; it is metered by the storage quota instead.
    // That quota only exists for a signed-in wallet, so anonymous voiceover
    // would be an unmetered, unlimited call straight through to ElevenLabs.
    if (!isAuthenticated) return 'Sign in to generate.';
    if (kind === 'voice' && prompt.length > MAX_VOICE_CHARS) {
      return `Voiceover is capped at ${MAX_VOICE_CHARS} characters.`;
    }
    if (kind === 'video' && activeVideoModel && !activeVideoModel.supports.includes('text-to-video')) {
      return `${activeVideoModel.name} needs a starting image. Generate from the Creator studio instead.`;
    }
    return null;
  }, [prompt, quota.overQuota, kind, isAuthenticated, activeVideoModel]);

  const canRun = !!prompt.trim() && !blockingIssue && !voiceBusy;

  const runVoice = useCallback(async () => {
    setVoiceBusy(true);
    try {
      const { blob } = await generateAudio({ text: prompt.trim(), voiceId: DEFAULT_VOICE_ID });
      const file = new File([blob], `voiceover-${Date.now()}.mp3`, { type: 'audio/mpeg' });
      const id = await importOneFile(file, { wallet: quota.walletAddress });
      if (id) {
        await quota.refetchUsage();
        window.dispatchEvent(new CustomEvent('editor:storage-usage-changed'));
        toast.success('Voiceover added to Media.');
        setPrompt('');
      }
    } catch (e) {
      console.error('[editor] voiceover failed', e);
      toast.error(e instanceof Error ? e.message : 'Voice generation failed.');
    } finally {
      setVoiceBusy(false);
    }
  }, [prompt, quota]);

  const run = useCallback(() => {
    if (!canRun) {
      if (blockingIssue) toast.error(blockingIssue);
      return;
    }
    if (kind === 'image') setImagePaywallOpen(true);
    else if (kind === 'video') setVideoPaywallOpen(true);
    else void runVoice();
  }, [canRun, blockingIssue, kind, runVoice]);

  const runImage = useCallback(() => {
    setImagePaywallOpen(false);
    startImage(
      { prompt: prompt.trim(), model: imageModel, aspectRatio: imageAspect },
      {
        prompt: prompt.trim(),
        resolvedPrompt: prompt.trim(),
        modelName: IMAGE_MODELS[imageModel]?.name ?? imageModel,
        aspect: imageAspect,
      },
    );
    setPanel('library');
    toast.success('Generating. It lands in the Generations tab.');
  }, [prompt, imageModel, imageAspect, startImage, setPanel]);

  const runVideoJob = useCallback(
    (options?: VideoGenerationOptions) => {
      setVideoPaywallOpen(false);
      startVideo(
        {
          prompt: prompt.trim(),
          model: videoModel,
          aspectRatio: videoAspect,
          duration: options?.duration,
          resolution: options?.resolution,
          negativePrompt: options?.negativePrompt,
          referenceImageUrls: options?.referenceImageUrls,
          endFrameUrl: options?.endFrameUrl,
          audioUrls: options?.audioUrls,
          videoUrls: options?.videoUrls,
          seed: options?.seed,
        },
        {
          prompt: prompt.trim(),
          resolvedPrompt: prompt.trim(),
          modelName: VIDEO_MODELS[videoModel]?.name ?? videoModel,
          aspect: videoAspect,
        },
      );
      setPanel('library');
      toast.success('Render queued. It lands in the Generations tab.');
    },
    [prompt, videoModel, videoAspect, startVideo, setPanel],
  );

  const modelOptions: ChipOption<string>[] =
    kind === 'image'
      ? IMAGE_MODEL_OPTIONS.map((m) => ({
          value: m.id,
          label: m.name,
          detail: m.description,
          meta: `$${getImageCostUsd(m).toFixed(2)}`,
        }))
      : VIDEO_MODEL_OPTIONS.map((m) => ({
          value: m.id,
          label: m.name,
          detail: m.description,
          meta: `$${getVideoCostUsd(m, m.defaultDuration ?? 5).toFixed(2)}`,
          disabled: !m.supports.includes('text-to-video'),
          disabledReason: 'Needs a starting image',
        }));

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3">
      <PanelHeading>Generate</PanelHeading>

      {/* Toggle buttons, not ARIA tabs: no tabpanel, no arrow-key navigation. */}
      <div
        role="group"
        aria-label="What to generate"
        className="mb-3 inline-flex w-full items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1"
      >
        {KINDS.map((k) => {
          const Icon = k.icon;
          const active = kind === k.id;
          return (
            <button
              key={k.id}
              type="button"
              aria-pressed={active}
              onClick={() => setKind(k.id)}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-semibold transition',
                active ? 'bg-white text-black' : 'text-white/60 hover:bg-white/10 hover:text-white',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {k.label}
            </button>
          );
        })}
      </div>

      <label htmlFor="editor-generate-prompt" className="sr-only">
        Prompt
      </label>
      <textarea
        id="editor-generate-prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            run();
          }
        }}
        rows={4}
        disabled={voiceBusy}
        placeholder={
          kind === 'voice'
            ? 'Type what the voice should say'
            : kind === 'video'
              ? 'Describe the shot you want'
              : 'Describe the image you want'
        }
        className="w-full resize-y rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-[13px] leading-relaxed text-white outline-none transition placeholder:text-white/35 focus:border-white/30"
      />

      {kind === 'voice' ? (
        <p className="mt-1.5 px-0.5 text-right text-[11px] tabular-nums text-white/40">
          {prompt.length} / {MAX_VOICE_CHARS}
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <SelectChip
            label="Model"
            width="md"
            value={kind === 'image' ? imageModel : videoModel}
            options={modelOptions}
            onChange={(v) =>
              kind === 'image' ? setImageModel(v as ImageModelKey) : setVideoModel(v as VideoModelKey)
            }
          />
          <SelectChip
            label="Aspect ratio"
            value={aspect}
            options={(kind === 'image'
              ? ['1:1', '4:5', '16:9', '9:16']
              : videoAspects
            ).map((a) => ({ value: a, label: a }))}
            onChange={kind === 'image' ? setImageAspect : setVideoAspect}
          />
        </div>
      )}

      {/* aria-disabled rather than disabled so the reason below stays reachable
          and announced for keyboard and screen-reader users. */}
      <button
        type="button"
        onClick={run}
        aria-disabled={!canRun}
        aria-describedby={blockingIssue ? 'editor-generate-blocking-reason' : undefined}
        className={cn(
          'mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-bold transition',
          canRun
            ? 'border-white/25 bg-white text-black hover:bg-white/90'
            : 'cursor-not-allowed border-white/20 bg-white/10 text-white/70',
        )}
      >
        {voiceBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {voiceBusy ? 'Synthesising' : 'Generate'}
      </button>

      {blockingIssue && (
        <p id="editor-generate-blocking-reason" className="mt-2 px-0.5 text-[11px] leading-snug text-white/60">
          {blockingIssue}
        </p>
      )}

      <p className="mt-3 px-0.5 text-[11px] leading-relaxed text-white/40">
        {kind === 'voice'
          ? 'Voiceovers use your storage quota and land straight in Media.'
          : 'Renders keep running while you edit. Finished results appear in the Generations tab, ready to drop on the timeline.'}
      </p>

      {activeImageModel && (
        <ImagePaywallModal
          key={imagePaywallOpen ? 'image-open' : `image-${surfaceEpoch}`}
          open={imagePaywallOpen}
          onOpenChange={setImagePaywallOpen}
          model={activeImageModel}
          selectedModelKey={imageModel}
          onModelChange={setImageModel}
          onConfirm={runImage}
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
          onConfirm={runVideoJob}
        />
      )}
    </div>
  );
}
