import { translateCopy as _translateCopy } from '@/i18n/copy';
import { useTranslation as _useCopy } from 'react-i18next';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
import { useEditorStore } from '@/store/editorStore';
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
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Film, ImageIcon, Loader2 } from "lucide-react";
import Music2 from "@/components/ui/cut-icons/music";
import Sparkles from "@/components/ui/cut-icons/assistant";

import Mic from "@/components/ui/cut-icons/mic";

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
import { AudioPaywallModal } from '@/components/app/audio/AudioPaywallModal';
import { AUDIO_TASKS, MUSIC_DEFAULT_SECONDS, MUSIC_MIN_SECONDS, MUSIC_MAX_SECONDS, billableUnits } from '@/constants/audio-models.constants';
import {
  VideoPaywallModal,
  type VideoGenerationOptions,
} from '@/components/app/video/VideoPaywallModal';
import { DEFAULT_VOICE_ID, generateAudio } from '@/lib/creator/generationEngine';
import { generatedMediaFormat } from '@/lib/creator/generatedMedia';
import { importOneFile } from '@/lib/editor/importFiles';
import { useGenerationStore } from '@/store/generationStore';
import { useEditorUiStore } from '@/store/editorUiStore';
import { useCloseOnSurfaceSwitch, useSurfaceEpoch } from '@/hooks/use-surface-switch';
import { SelectChip, CounterChip, ToggleChip, type ChipOption } from '@/components/app/creator/studio/StudioChip';
import { soundEffectRequest, SFX_MAX_PROMPT_CHARS } from '@/lib/editor/soundEffectDraft';
import { PanelHeading } from './DesignPanel';
import { StudioVoicePicker } from '@/components/app/creator/studio/StudioVoicePicker';
import { Model3dPaywallModal, type Model3dGenerationOptions } from '@/components/app/model3d/Model3dPaywallModal';
import { MODEL3D_MODELS, MODEL3D_MODEL_OPTIONS, getModel3dCostUsd, type Model3dModelKey } from '@/constants/model3d-models.constants';
import { editorErrorText } from "@/lib/editor/editorErrorText";

type GenKind = 'image' | 'video' | 'voice' | 'music' | 'sfx' | 'model3d';

const KINDS: { id: GenKind; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'image', get label() { return _translateCopy("copy.1aa4cb0bcca7", { defaultValue: "Image" }); }, icon: ImageIcon },
  { id: 'video', get label() { return _translateCopy("copy.d534be829e32", { defaultValue: "Video" }); }, icon: Film },
  { id: 'voice', get label() { return _translateCopy("copy.87bf2bc08589", { defaultValue: "Voice" }); }, icon: Mic },
  { id: 'music', get label() { return _translateCopy('creator.audioTaskMusicLabel', { defaultValue: 'Music' }); }, icon: Music2 },
];

KINDS.push({ id: 'sfx', get label() { return _translateCopy('creator.audioTaskSfxLabel', { defaultValue: 'Sound effect' }); }, icon: Music2 });
KINDS.push({ id: 'model3d', get label() { return _translateCopy('editor.generate3d.label', { defaultValue: '3D' }); }, icon: Box });

/** The editor only has a prompt to work from, so only models that read text are offered. */
const TEXT_3D_MODELS = MODEL3D_MODEL_OPTIONS.filter((m) => m.supports.includes('text-to-3d'));

// Loaded on demand: it pulls in the payment and Stage voice code.
const VoiceCloneDialog = lazy(() => import('../VoiceCloneDialog').then((m) => ({ default: m.VoiceCloneDialog })));

const MAX_VOICE_CHARS = 500;
const MAX_MUSIC_PROMPT_CHARS = 2000;

export function GeneratePanel() {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const quota = useEditorQuota();
  const { isAuthenticated } = useAuth() as { isAuthenticated: boolean };
  const startImage = useGenerationStore((s) => s.startImage);
  const startVideo = useGenerationStore((s) => s.startVideo);
  const startAudio = useGenerationStore((s) => s.startAudio);
  const startModel3d = useGenerationStore((s) => s.startModel3d);
  const setPanel = useEditorUiStore((s) => s.setPanel);
  const generatePrefill = useEditorUiStore((s) => s.generatePrefill);
  const setGeneratePrefill = useEditorUiStore((s) => s.setGeneratePrefill);

  const [kind, setKind] = useState<GenKind>('image');
  const draftProjectId = useEditorStore(s => s.projectId);
  const [prompt, setPrompt] = useSurfaceDraft("components/editor/panels/GeneratePanel.tsx:prompt", '', draftProjectId);
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
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE_ID);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [voiceListKey, setVoiceListKey] = useState(0);
  const [model3dModel, setModel3dModel] = useState<Model3dModelKey>(TEXT_3D_MODELS[0]?.id ?? 'tripo-2.5');
  const [model3dPaywallOpen, setModel3dPaywallOpen] = useState(false);
  const [musicSeconds, setMusicSeconds] = useState(MUSIC_DEFAULT_SECONDS);
  const [sfxSeconds, setSfxSeconds] = useState(0);
  const [sfxLoop, setSfxLoop] = useState(false);
  const [instrumental, setInstrumental] = useState(true);
  const [musicDraft, setMusicDraft] = useState<{ prompt: string; lengthSeconds: number; instrumental: boolean } | null>(null);

  const activeImageModel = IMAGE_MODELS[imageModel];
  const activeVideoModel = VIDEO_MODELS[videoModel];
  const videoAspects = useMemo(
    () => activeVideoModel?.aspectRatios ?? ['16:9', '9:16', '1:1'],
    [activeVideoModel],
  );
  const aspect = kind === 'video' ? videoAspect : imageAspect;

  // The AI agent prepares a generation and hands it over here; the user still
  // presses Generate, since this spends DHB.
  useEffect(() => {
    if (!generatePrefill) return;
    setKind(generatePrefill.kind);
    setPrompt.initialize(generatePrefill.prompt);
    if (generatePrefill.aspect) {
      if (generatePrefill.kind === 'video') setVideoAspect(generatePrefill.aspect);
      else if (generatePrefill.kind === 'image') setImageAspect(generatePrefill.aspect);
    }
    setGeneratePrefill(null);
  }, [generatePrefill, setGeneratePrefill, setPrompt]);

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
      setModel3dPaywallOpen(false);
      setCloneOpen(false);
      setMusicDraft(null);
    }, []),
  );
  const surfaceEpoch = useSurfaceEpoch();

  const blockingIssue = useMemo(() => {
    if (!prompt.trim()) return null;
    if (quota.overQuota) return t('editor.storageFullRemoveOrStake');
    // Voice is not charged in DHB; it is metered by the storage quota instead.
    // That quota only exists for a signed-in wallet, so anonymous voiceover
    // would be an unmetered, unlimited call straight through to ElevenLabs.
    if (!isAuthenticated) return t('editor.signInToGenerate', { defaultValue: 'Sign in to generate.' });
    if (kind === 'voice' && prompt.length > MAX_VOICE_CHARS) {
      return t('editor.voiceoverLimit', { count: MAX_VOICE_CHARS, defaultValue: 'Voiceover is capped at {{count}} characters.' });
    }
    if (kind === 'sfx' && prompt.trim().length > SFX_MAX_PROMPT_CHARS) {
      return t('creator.validation.speechLimit', { length: prompt.trim().length.toLocaleString(), limit: SFX_MAX_PROMPT_CHARS.toLocaleString() });
    }
    if (kind === 'music' && prompt.trim().length > MAX_MUSIC_PROMPT_CHARS) {
      return t('creator.validation.speechLimit', { length: prompt.trim().length.toLocaleString(), limit: MAX_MUSIC_PROMPT_CHARS.toLocaleString(), defaultValue: 'The prompt is limited to {{limit}} characters.' });
    }
    if (kind === 'video' && activeVideoModel && !activeVideoModel.supports.includes('text-to-video')) {
      return t('editor.videoNeedsImage', { model: activeVideoModel.name, defaultValue: '{{model}} needs a starting image. Generate from the Creator studio instead.' });
    }
    return null;
  }, [prompt, quota.overQuota, kind, isAuthenticated, activeVideoModel, t]);

  const canRun = !!prompt.trim() && !blockingIssue && !voiceBusy;

  const runVoice = useCallback(async () => {
    setVoiceBusy(true);
    try {
      const { blob } = await generateAudio({ text: prompt.trim(), voiceId });
      const format = generatedMediaFormat('audio', '', blob.type);
      const file = new File([blob], `voiceover-${Date.now()}.${format.ext}`, { type: format.mime });
      const id = await importOneFile(file, { wallet: quota.walletAddress,
        badgeBalance: quota.badgeBalance, username: quota.username });
      if (id) {
        await quota.refetchUsage();
        window.dispatchEvent(new CustomEvent('editor:storage-usage-changed'));
        toast.success(_copy("copy.54e2adfa97fe", { defaultValue: "Voiceover added to Media." }));
        setPrompt.complete(prompt, '');
      }
    } catch (e) {
      console.error('[editor] voiceover failed', e);
      toast.error(editorErrorText(e, t("copy.953e708b2287", { defaultValue: "Voice generation failed." })));
    } finally {
      setVoiceBusy(false);
    }
  }, [prompt, quota, setPrompt, voiceId, t, _copy]);

  const run = useCallback(() => {
    if (!canRun) {
      if (blockingIssue) toast.error(blockingIssue);
      return;
    }
    if (kind === 'image') setImagePaywallOpen(true);
    else if (kind === 'video') setVideoPaywallOpen(true);
    else if (kind === 'model3d') setModel3dPaywallOpen(true);
    else if (kind === 'music') setMusicDraft({ prompt: prompt.trim(), lengthSeconds: musicSeconds, instrumental });
    else if (kind === 'sfx') {
      const request = soundEffectRequest({ text: prompt, durationSeconds: sfxSeconds, loop: sfxLoop });
      startAudio(request, { prompt: request.text, resolvedPrompt: request.text, modelName: t(AUDIO_TASKS.sfx.labelKey), aspect: '1:1' });
      setPanel('library');
      toast.success(_copy('copy.241a018b66a8', { defaultValue: 'Generating. It lands in the Generations tab.' }));
    } else void runVoice();
  }, [canRun, blockingIssue, kind, runVoice, prompt, musicSeconds, instrumental, sfxSeconds, sfxLoop, startAudio, setPanel, t, _copy]);

  const runMusic = useCallback((txHash: string) => {
    if (!musicDraft) return;
    startAudio({ task: 'music', ...musicDraft, txHash }, {
      prompt: musicDraft.prompt, resolvedPrompt: musicDraft.prompt,
      modelName: t(AUDIO_TASKS.music.labelKey), aspect: '1:1',
    });
    setMusicDraft(null); setPanel('library');
    toast.success(_copy('copy.241a018b66a8', { defaultValue: 'Generating. It lands in the Generations tab.' }));
  }, [musicDraft, startAudio, setPanel, t, _copy]);

  const run3d = useCallback((options: Model3dGenerationOptions | undefined, txHash: string) => {
    setModel3dPaywallOpen(false);
    startModel3d(
      { prompt: prompt.trim(), model: model3dModel, textureQuality: options?.textureQuality, pbr: options?.pbr,
        faceLimit: options?.faceLimit, quad: options?.quad, seed: options?.seed, exportFormat: 'glb', txHash },
      { prompt: prompt.trim(), resolvedPrompt: prompt.trim(), modelName: MODEL3D_MODELS[model3dModel]?.name ?? model3dModel, aspect: '1:1' },
    );
    setPanel('library');
    toast.success(t('editor.generate3d.queued'));
  }, [prompt, model3dModel, startModel3d, setPanel, t]);

  const runImage = useCallback((txHash: string) => {
    setImagePaywallOpen(false);
    startImage(
      { prompt: prompt.trim(), model: imageModel, aspectRatio: imageAspect, txHash },
      {
        prompt: prompt.trim(),
        resolvedPrompt: prompt.trim(),
        modelName: IMAGE_MODELS[imageModel]?.name ?? imageModel,
        aspect: imageAspect,
      },
    );
    setPanel('library');
    toast.success(_copy("copy.241a018b66a8", { defaultValue: "Generating. It lands in the Generations tab." }));
  }, [prompt, imageModel, imageAspect, startImage, setPanel, _copy]);

  const runVideoJob = useCallback(
    (options: VideoGenerationOptions | undefined, txHash: string) => {
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
          txHash,
        },
        {
          prompt: prompt.trim(),
          resolvedPrompt: prompt.trim(),
          modelName: VIDEO_MODELS[videoModel]?.name ?? videoModel,
          aspect: videoAspect,
        },
      );
      setPanel('library');
      toast.success(_copy("copy.8510df0bd421", { defaultValue: "Render queued. It lands in the Generations tab." }));
    },
    [prompt, videoModel, videoAspect, startVideo, setPanel, _copy],
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
      <PanelHeading>{_copy("copy.49e49bb4401e", { defaultValue: "Generate" })}</PanelHeading>

      {/* Toggle buttons, not ARIA tabs: no tabpanel, no arrow-key navigation. */}
      <div
        role="group"
        aria-label={_copy("copy.e98872cc5520", { defaultValue: "What to generate" })}
        className="mb-3 inline-flex w-full flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1"
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
                (k.id === 'sfx' || k.id === 'model3d') && 'basis-[45%]',
                active ? 'bg-white text-black' : 'text-white/60 hover:bg-white/10 hover:text-white',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {k.label}
            </button>
          );
        })}
      </div>

      <label htmlFor="editor-generate-prompt" className="sr-only">{_copy("copy.5c39123805ff", { defaultValue: "Prompt" })}</label>
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
            ? _copy("copy.24accbdc740c", { defaultValue: "Type what the voice should say" })
            : kind === 'sfx'
              ? t('creator.audioTaskSfxPlaceholder')
            : kind === 'music'
              ? t('creator.audioTaskMusicPlaceholder')
            : kind === 'model3d'
              ? t('editor.generate3d.placeholder')
            : kind === 'video'
              ? _copy("copy.a931594a03cd", { defaultValue: "Describe the shot you want" })
              : _copy("copy.f0c4005c1962", { defaultValue: "Describe the image you want" })
        }
        className="w-full resize-y rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-[13px] leading-relaxed text-white outline-none transition placeholder:text-white/35 focus:border-white/30"
      />

      {kind === 'voice' ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StudioVoicePicker key={voiceListKey} value={voiceId} onChange={setVoiceId} onDesignVoice={() => setCloneOpen(true)}
            actionLabel={t('editor.voiceClone.pickerLabel')} actionDetail={t('editor.voiceClone.pickerDetail')} />
          <p className="ml-auto px-0.5 text-right text-[11px] tabular-nums text-white/40">
            {prompt.length} / {MAX_VOICE_CHARS}
          </p>
        </div>
      ) : kind === 'model3d' ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <SelectChip label={_copy("copy.5e2c614c23f0", { defaultValue: "Model" })} width="md" value={model3dModel}
            options={TEXT_3D_MODELS.map((m) => ({ value: m.id, label: m.name, detail: m.description, meta: `$${getModel3dCostUsd(m).toFixed(2)}` }))}
            onChange={(v) => setModel3dModel(v as Model3dModelKey)} />
        </div>
      ) : kind === 'sfx' ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <SelectChip label={t('creator.length')} value={String(sfxSeconds)} display={sfxSeconds ? `${sfxSeconds}s` : t('creator.auto')}
            options={[0, 0.5, 1, 2, 5, 10, 22, 30].map(value => ({ value: String(value), label: value ? `${value}s` : t('creator.auto') }))} onChange={value => setSfxSeconds(Number(value))} />
          <ToggleChip label={t('creator.loop')} active={sfxLoop} onClick={() => setSfxLoop(value => !value)} />
          <p className="w-full text-right text-[11px] tabular-nums text-white/40">{prompt.trim().length} / {SFX_MAX_PROMPT_CHARS}</p>
        </div>
      ) : kind === 'music' ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <CounterChip draftScope={`${draftProjectId}:editor-music`} label={t('creator.length')} displayUnit="s" value={musicSeconds} min={MUSIC_MIN_SECONDS} max={MUSIC_MAX_SECONDS} editable onChange={setMusicSeconds} />
          <ToggleChip label={t('creator.instrumental')} active={instrumental} onClick={() => setInstrumental(value => !value)} />
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <SelectChip
            label={_copy("copy.5e2c614c23f0", { defaultValue: "Model" })}
            width="md"
            value={kind === 'image' ? imageModel : videoModel}
            options={modelOptions}
            onChange={(v) =>
              kind === 'image' ? setImageModel(v as ImageModelKey) : setVideoModel(v as VideoModelKey)
            }
          />
          <SelectChip
            label={_copy("copy.d7ad336f35e1", { defaultValue: "Aspect ratio" })}
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
        {voiceBusy ? _copy("copy.714c707e35bd", { defaultValue: "Synthesising" }) : _copy("copy.49e49bb4401e", { defaultValue: "Generate" })}
      </button>

      {blockingIssue && (
        <p id="editor-generate-blocking-reason" className="mt-2 px-0.5 text-[11px] leading-snug text-white/60">
          {blockingIssue}
        </p>
      )}

      <p className="mt-3 px-0.5 text-[11px] leading-relaxed text-white/40">
        {kind === 'voice'
          ? _copy("copy.b57c54362f70", { defaultValue: "Voiceovers use your storage quota and land straight in Media." })
          : kind === 'model3d'
            ? t('editor.generate3d.note')
          : _copy("copy.eb9f691bb8c2", { defaultValue: "Renders keep running while you edit. Finished results appear in the Generations tab, ready to drop on the timeline." })}
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
      {MODEL3D_MODELS[model3dModel] && (
        <Model3dPaywallModal
          key={model3dPaywallOpen ? 'model3d-open' : `model3d-${surfaceEpoch}`}
          open={model3dPaywallOpen}
          onOpenChange={setModel3dPaywallOpen}
          model={MODEL3D_MODELS[model3dModel]}
          selectedModelKey={model3dModel}
          onModelChange={setModel3dModel}
          onConfirm={run3d}
        />
      )}
      {cloneOpen && (
        <Suspense fallback={null}>
          <VoiceCloneDialog open={cloneOpen} onOpenChange={setCloneOpen}
            onCloned={(id) => { if (id) setVoiceId(id); setVoiceListKey((k) => k + 1); }} />
        </Suspense>
      )}
      <AudioPaywallModal
        key={musicDraft ? 'music-open' : `music-${surfaceEpoch}`}
        open={!!musicDraft}
        onOpenChange={open => { if (!open) setMusicDraft(null); }}
        spec={AUDIO_TASKS.music}
        units={billableUnits(AUDIO_TASKS.music, musicDraft?.lengthSeconds ?? musicSeconds)}
        quantityLabel={`${musicDraft?.lengthSeconds ?? musicSeconds}s`}
        onConfirm={runMusic}
      />
    </div>
  );
}
