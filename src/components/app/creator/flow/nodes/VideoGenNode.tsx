/**
 * Creator Flow — video generator node.
 * ====================================
 * Adapted from HeliosGen's VideoGeneratorNode (MIT) — see LICENSE-HeliosGen.
 * Text plus optional start frame, end frame, reference images and reference
 * clips, rendered through the shared queue. Its output is both the clip and,
 * on demand, a still from it — so one generator can feed the next.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, Clapperboard, CopyPlus, Download, Loader2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { NodeProps } from '@xyflow/react';
import { toast } from 'sonner';
import { VIDEO_MODEL_OPTIONS, VIDEO_MODELS, snapVideoDuration } from '@/constants/video-models.constants';
import { captureVideoFrame } from '@/lib/creator/flow/frames';
import { DEFAULT_VIDEO_MODEL } from '@/lib/creator/flow/runner';
import type { FlowNode, GenEntry, NodeData } from '@/lib/creator/flow/types';
import { uid } from '@/lib/creator/flow/types';
import { useCreatorFlowStore } from '@/store/creatorFlowStore';
import { cn } from '@/lib/utils';
import {
  AboveLabel,
  CornerResizer,
  HandleTip,
  IoHandle,
  MissingInputWarning,
  NodeActionBar,
  NodeCard,
  Pill,
  PillMenu,
  StatusDot,
  ratioCss,
  useElevateWhileOpen,
  useHandleConnected,
  useInstantHandleHide,
} from '../NodeChrome';
import { useFlowActions } from '../FlowActionsContext';

const ASPECTS = ['16:9', '9:16', '1:1', '4:3', '3:4'];
const RESOLUTIONS: Array<'480p' | '720p' | '1080p'> = ['480p', '720p', '1080p'];

type InHandle = 'prompt' | 'startFrame' | 'endFrame' | 'image' | 'referenceVideo';
const IN_HANDLES: Array<{ id: InHandle; kind: 'prompt' | 'image' | 'video'; labelKey: string }> = [
  { id: 'prompt', kind: 'prompt', labelKey: 'creatorFlow.handlePrompt' },
  { id: 'startFrame', kind: 'image', labelKey: 'creatorFlow.handleStartFrame' },
  { id: 'endFrame', kind: 'image', labelKey: 'creatorFlow.handleEndFrame' },
  { id: 'image', kind: 'image', labelKey: 'creatorFlow.handleReferenceImages' },
  { id: 'referenceVideo', kind: 'video', labelKey: 'creatorFlow.handleReferenceVideo' },
];
const HANDLE_SPACING = 30;
const handleTop = (i: number) => `calc(50% + ${(i - (IN_HANDLES.length - 1) / 2) * HANDLE_SPACING}px)`;

export default function VideoGenNode({ id, data, selected }: NodeProps<FlowNode>) {
  const { t } = useTranslation();
  const { runNodes, readOnly } = useFlowActions();
  const updateNodeData = useCreatorFlowStore((s) => s.updateNodeData);
  const onNodesChange = useCreatorFlowStore((s) => s.onNodesChange);
  const addNode = useCreatorFlowStore((s) => s.addNode);
  const nodes = useCreatorFlowStore((s) => s.nodes);
  const isRunning = useCreatorFlowStore((s) => s.isRunning);

  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  useInstantHandleHide(selected, cardRef);

  const [menu, setMenu] = useState<'model' | 'ratio' | 'duration' | 'resolution' | null>(null);
  const [hovered, setHovered] = useState<InHandle | null>(null);
  const [capturing, setCapturing] = useState(false);
  useElevateWhileOpen(cardRef, menu !== null);

  const model = (data.model as string) || DEFAULT_VIDEO_MODEL;
  const cfg = VIDEO_MODELS[model];
  const aspect = (data.aspectRatio as string) || '16:9';
  const duration = cfg ? snapVideoDuration(cfg, (data.duration as number) || cfg.defaultDuration || 5) : (data.duration as number) || 5;
  const resolution = (data.resolution as '480p' | '720p' | '1080p' | undefined) ?? '720p';
  const status = data.status ?? 'idle';
  const busy = status === 'running' || status === 'pending' || !!data.pipelineQueued;

  const connected: Record<InHandle, boolean> = {
    prompt: useHandleConnected(id, 'prompt', 'target'),
    startFrame: useHandleConnected(id, 'startFrame', 'target'),
    endFrame: useHandleConnected(id, 'endFrame', 'target'),
    image: useHandleConnected(id, 'image', 'target'),
    referenceVideo: useHandleConnected(id, 'referenceVideo', 'target'),
  };
  const videoOut = useHandleConnected(id, 'video', 'source');
  const frameOut = useHandleConnected(id, 'frame', 'source');

  const generations = (data.generations as GenEntry[] | undefined) ?? [];
  const genIdx = Math.min((data.currentGenIdx as number | undefined) ?? generations.length - 1, generations.length - 1);
  const current = genIdx >= 0 ? generations[genIdx] : undefined;
  const shownUrl = typeof current === 'string' ? current : (data.videoUrl as string | undefined);
  const shownError = current && typeof current === 'object' ? current.error : status === 'error' ? (data.errorMsg as string | undefined) : undefined;

  const step = useCallback(
    (dir: 1 | -1) => {
      const next = Math.max(0, Math.min(generations.length - 1, genIdx + dir));
      const entry = generations[next];
      updateNodeData(id, { currentGenIdx: next, ...(typeof entry === 'string' ? { videoUrl: entry, capturedFrameUrl: undefined } : {}) });
    },
    [generations, genIdx, id, updateNodeData],
  );

  const capture = useCallback(
    async (opts: { seconds?: number; last?: boolean }) => {
      if (!shownUrl) return;
      setCapturing(true);
      try {
        const url = await captureVideoFrame(shownUrl, opts);
        updateNodeData(id, { capturedFrameUrl: url, captureSeconds: opts.seconds ?? -1 });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('creatorFlow.captureFailed'));
      } finally {
        setCapturing(false);
      }
    },
    [id, shownUrl, t, updateNodeData],
  );

  // A wired frame output with no still yet: take the last frame, which is
  // what chaining clips end-to-start wants.
  useEffect(() => {
    if (readOnly || !frameOut || data.capturedFrameUrl || !shownUrl || capturing || busy) return;
    void capture({ last: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameOut, shownUrl, data.capturedFrameUrl, readOnly, busy]);

  const handleDuplicate = () => {
    const self = nodes.find((n) => n.id === id);
    if (!self) return;
    addNode({
      ...self,
      id: `videoGenNode-${uid()}`,
      position: { x: self.position.x + 30, y: self.position.y + 30 },
      selected: true,
      data: { ...self.data, label: '', status: 'idle', jobId: undefined, hasError: false } as NodeData,
    });
  };

  const download = async () => {
    if (!shownUrl) return;
    try {
      const res = await fetch(shownUrl);
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `dehub-flow-${id}.mp4`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 30_000);
    } catch {
      window.open(shownUrl, '_blank', 'noopener');
    }
  };

  const durationOptions: number[] = cfg?.allowedDurations?.length
    ? cfg.allowedDurations
    : Array.from({ length: Math.max(1, (cfg?.maxDuration ?? 10) - (cfg?.minDuration ?? 1) + 1) }, (_, i) => (cfg?.minDuration ?? 1) + i).filter((d) => d <= 15);

  const warnings: string[] = [];
  if (!connected.prompt) warnings.push(t('creatorFlow.issueTextRequired'));
  if (cfg && !cfg.supports.includes('text-to-video') && !connected.startFrame) warnings.push(t('creatorFlow.issueStartFrameRequired'));

  return (
    <NodeCard cardRef={cardRef} error={!!data.hasError} onErrorEnd={() => updateNodeData(id, { hasError: false })} style={{ minWidth: 260 }}>
      {!readOnly && <CornerResizer minWidth={240} minHeight={200} />}
      <AboveLabel text={data.label as string} />
      {!readOnly && !busy && <MissingInputWarning messages={warnings} />}

      {!readOnly && (
        <NodeActionBar
          visible={selected}
          actions={[
            { icon: <Download size={13} />, title: t('creatorFlow.download'), onClick: () => void download(), disabled: !shownUrl },
            { icon: <Camera size={13} />, title: t('creatorFlow.captureFrameAtPlayhead'), onClick: () => void capture({ seconds: videoRef.current?.currentTime ?? 0 }), disabled: !shownUrl || capturing },
            { icon: <CopyPlus size={13} />, title: t('creatorFlow.duplicateNode'), onClick: handleDuplicate },
            { icon: <Trash2 size={13} />, title: t('creatorFlow.deleteNode'), onClick: () => onNodesChange([{ type: 'remove', id }]), separatorBefore: true },
          ]}
        />
      )}

      {IN_HANDLES.map((h, i) => (
        <IoHandle key={h.id} type="target" id={h.id} kind={h.kind} accepts={[h.kind]} connected={connected[h.id]} top={handleTop(i)} onHover={(on) => setHovered(on ? h.id : null)} />
      ))}
      {hovered && <HandleTip top={handleTop(IN_HANDLES.findIndex((h) => h.id === hovered))} text={t(IN_HANDLES.find((h) => h.id === hovered)!.labelKey)} />}
      <IoHandle type="source" id="video" kind="video" connected={videoOut} top="calc(50% - 16px)" title={t('creatorFlow.handleVideoOut')} />
      <IoHandle type="source" id="frame" kind="image" connected={frameOut} top="calc(50% + 16px)" title={t('creatorFlow.handleFrameOut')} />

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-[13px] bg-black/40" style={{ aspectRatio: shownUrl ? undefined : ratioCss(aspect, '16 / 9') }}>
        {shownUrl ? (
          <video ref={videoRef} src={shownUrl} controls muted loop playsInline preload="metadata" className="nodrag nowheel h-full w-full object-contain" onMouseDown={(e) => e.stopPropagation()} />
        ) : (
          <div className="flex h-full min-h-[140px] w-full flex-col items-center justify-center gap-2 text-white/35">
            {busy ? <Loader2 size={18} className="animate-spin text-white/70" /> : <Clapperboard size={18} />}
            <span className="max-w-[80%] text-center text-[11px] leading-snug">
              {busy ? (data.pipelineQueued ? t('creatorFlow.queued') : t('creatorFlow.renderingVideo')) : shownError ?? t('creatorFlow.videoGenEmpty')}
            </span>
          </div>
        )}
        {busy && shownUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
            <Loader2 size={20} className="animate-spin text-white" />
          </div>
        )}
        {(capturing || data.capturedFrameUrl) && (
          <div className="absolute right-2 top-2 flex items-center gap-1">
            {capturing ? (
              <span className="flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white backdrop-blur"><Loader2 size={11} className="animate-spin" /> {t('creatorFlow.capturing')}</span>
            ) : (
              <img src={data.capturedFrameUrl as string} alt="" className="h-9 w-14 rounded-md border border-white/30 object-cover shadow" title={t('creatorFlow.capturedFrame')} />
            )}
          </div>
        )}
        <div className="absolute left-2 top-2"><StatusDot status={status} /></div>

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 bg-gradient-to-t from-black/85 to-transparent p-2 pt-8" style={{ pointerEvents: 'none' }}>
          <div className="flex flex-wrap items-center gap-1" style={{ pointerEvents: 'auto' }}>
            <div className="relative">
              <Pill active={menu === 'model'} onClick={readOnly ? undefined : () => setMenu(menu === 'model' ? null : 'model')} title={t('creatorFlow.model')}>
                <span className="max-w-[110px] truncate">{cfg?.name ?? model}</span>
              </Pill>
              <PillMenu open={menu === 'model'} onClose={() => setMenu(null)} value={model} onSelect={(v) => updateNodeData(id, { model: v })} options={VIDEO_MODEL_OPTIONS.map((m) => ({ value: m.id, label: m.name, hint: m.duration }))} />
            </div>
            <div className="relative">
              <Pill active={menu === 'ratio'} onClick={readOnly ? undefined : () => setMenu(menu === 'ratio' ? null : 'ratio')} title={t('creatorFlow.aspectRatio')}>{aspect}</Pill>
              <PillMenu open={menu === 'ratio'} onClose={() => setMenu(null)} value={aspect} onSelect={(v) => updateNodeData(id, { aspectRatio: v })} options={ASPECTS.map((a) => ({ value: a, label: a }))} />
            </div>
            <div className="relative">
              <Pill active={menu === 'duration'} onClick={readOnly ? undefined : () => setMenu(menu === 'duration' ? null : 'duration')} title={t('creatorFlow.duration')}>{duration}s</Pill>
              <PillMenu open={menu === 'duration'} onClose={() => setMenu(null)} value={String(duration)} onSelect={(v) => updateNodeData(id, { duration: Number(v) })} options={durationOptions.map((d) => ({ value: String(d), label: `${d}s` }))} />
            </div>
            {cfg?.supportsResolution && (
              <div className="relative">
                <Pill active={menu === 'resolution'} onClick={readOnly ? undefined : () => setMenu(menu === 'resolution' ? null : 'resolution')} title={t('creatorFlow.resolution')}>{resolution}</Pill>
                <PillMenu open={menu === 'resolution'} onClose={() => setMenu(null)} value={resolution} onSelect={(v) => updateNodeData(id, { resolution: v })} options={RESOLUTIONS.map((r) => ({ value: r, label: r }))} />
              </div>
            )}
          </div>
          {!readOnly && (
            <button
              type="button"
              style={{ pointerEvents: 'auto' }}
              onClick={(e) => {
                e.stopPropagation();
                runNodes([id]);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={busy || isRunning}
              title={t('creatorFlow.generate')}
              className={cn(
                'flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold backdrop-blur-xl transition',
                busy || isRunning ? 'border-white/10 bg-white/5 text-white/40' : 'border-white/20 bg-white text-black hover:bg-zinc-200',
              )}
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Clapperboard size={12} />}
              {t('creatorFlow.generate')}
            </button>
          )}
        </div>
      </div>

      {generations.length > 1 && (
        <div className="absolute left-1/2 top-full mt-2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-zinc-950/90 px-1 py-0.5 text-[10px] text-white/70 backdrop-blur" onMouseDown={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => step(-1)} disabled={genIdx <= 0} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-30" aria-label={t('creatorFlow.previousResult')}><ChevronLeft size={12} /></button>
          <span className="tabular-nums">{genIdx + 1}/{generations.length}</span>
          <button type="button" onClick={() => step(1)} disabled={genIdx >= generations.length - 1} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-30" aria-label={t('creatorFlow.nextResult')}><ChevronRight size={12} /></button>
        </div>
      )}
    </NodeCard>
  );
}
