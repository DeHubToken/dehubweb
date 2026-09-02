/**
 * Creator Flow — image generator node.
 * ====================================
 * Takes a text prompt and up to one reference, renders through the shared
 * generation queue (so the result also lands in the studio library), and
 * keeps a carousel of everything it has produced.
 */
import { useCallback, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, CopyPlus, Download, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { NodeProps } from '@xyflow/react';
import { IMAGE_MODEL_OPTIONS, IMAGE_MODELS, imageModelSupportsEdit } from '@/constants/image-models.constants';
import { DEFAULT_IMAGE_MODEL } from '@/lib/creator/flow/runner';
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

const ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'];

export default function ImageGenNode({ id, data, selected }: NodeProps<FlowNode>) {
  const { t } = useTranslation();
  const { runNodes, readOnly } = useFlowActions();
  const updateNodeData = useCreatorFlowStore((s) => s.updateNodeData);
  const onNodesChange = useCreatorFlowStore((s) => s.onNodesChange);
  const addNode = useCreatorFlowStore((s) => s.addNode);
  const nodes = useCreatorFlowStore((s) => s.nodes);
  const isRunning = useCreatorFlowStore((s) => s.isRunning);

  const cardRef = useRef<HTMLDivElement>(null);
  useInstantHandleHide(selected, cardRef);

  const [modelOpen, setModelOpen] = useState(false);
  const [ratioOpen, setRatioOpen] = useState(false);
  const [hoveredHandle, setHoveredHandle] = useState<'prompt' | 'image' | null>(null);
  useElevateWhileOpen(cardRef, modelOpen || ratioOpen);

  const model = (data.model as string) || DEFAULT_IMAGE_MODEL;
  const modelCfg = IMAGE_MODELS[model];
  const aspect = (data.aspectRatio as string) || '1:1';
  const status = data.status ?? 'idle';
  const busy = status === 'running' || status === 'pending' || !!data.pipelineQueued;

  const promptConnected = useHandleConnected(id, 'prompt', 'target');
  const imageConnected = useHandleConnected(id, 'image', 'target');
  const sourceConnected = useHandleConnected(id, undefined, 'source');

  const generations = (data.generations as GenEntry[] | undefined) ?? [];
  const genIdx = Math.min((data.currentGenIdx as number | undefined) ?? generations.length - 1, generations.length - 1);
  const current = genIdx >= 0 ? generations[genIdx] : undefined;
  const shownUrl = typeof current === 'string' ? current : (data.imageUrl as string | undefined);
  const shownError = current && typeof current === 'object' ? current.error : (status === 'error' ? (data.errorMsg as string | undefined) : undefined);

  const step = useCallback(
    (dir: 1 | -1) => {
      const next = Math.max(0, Math.min(generations.length - 1, genIdx + dir));
      const entry = generations[next];
      updateNodeData(id, { currentGenIdx: next, ...(typeof entry === 'string' ? { imageUrl: entry } : {}) });
    },
    [generations, genIdx, id, updateNodeData],
  );

  const handleDuplicate = () => {
    const self = nodes.find((n) => n.id === id);
    if (!self) return;
    addNode({
      ...self,
      id: `imageGenNode-${uid()}`,
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
      a.download = `dehub-flow-${id}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 30_000);
    } catch {
      window.open(shownUrl, '_blank', 'noopener');
    }
  };

  const warnings: string[] = [];
  if (!promptConnected) warnings.push(t('creatorFlow.issueTextRequired'));

  return (
    <NodeCard cardRef={cardRef} error={!!data.hasError} onErrorEnd={() => updateNodeData(id, { hasError: false })} style={{ minWidth: 220 }}>
      {!readOnly && <CornerResizer minWidth={200} minHeight={200} />}
      <AboveLabel text={data.label as string} />
      {!readOnly && !busy && <MissingInputWarning messages={warnings} />}

      {!readOnly && (
        <NodeActionBar
          visible={selected}
          actions={[
            { icon: <Download size={13} />, title: t('creatorFlow.download'), onClick: () => void download(), disabled: !shownUrl },
            { icon: <CopyPlus size={13} />, title: t('creatorFlow.duplicateNode'), onClick: handleDuplicate },
            { icon: <Trash2 size={13} />, title: t('creatorFlow.deleteNode'), onClick: () => onNodesChange([{ type: 'remove', id }]), separatorBefore: true },
          ]}
        />
      )}

      <IoHandle type="target" id="prompt" kind="prompt" accepts={['prompt']} connected={promptConnected} top="calc(50% - 16px)" onHover={(h) => setHoveredHandle(h ? 'prompt' : null)} />
      <IoHandle type="target" id="image" kind="image" accepts={['image']} connected={imageConnected} top="calc(50% + 16px)" onHover={(h) => setHoveredHandle(h ? 'image' : null)} />
      {hoveredHandle && (
        <HandleTip
          top={hoveredHandle === 'prompt' ? 'calc(50% - 16px)' : 'calc(50% + 16px)'}
          text={hoveredHandle === 'prompt' ? t('creatorFlow.handlePrompt') : modelCfg && !imageModelSupportsEdit(modelCfg) ? t('creatorFlow.handleImageUnsupported') : t('creatorFlow.handleImage')}
        />
      )}
      <IoHandle type="source" kind="image" connected={sourceConnected} title={t('creatorFlow.handleImageOut')} />

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-[13px] bg-black/40" style={{ aspectRatio: shownUrl ? undefined : ratioCss(aspect) }}>
        {shownUrl ? (
          <img src={shownUrl} alt={(data.prompt as string) || ''} className="h-full w-full object-cover" draggable={false} />
        ) : (
          <div className="flex h-full min-h-[140px] w-full flex-col items-center justify-center gap-2 text-white/35">
            {busy ? <Loader2 size={18} className="animate-spin text-white/70" /> : <Sparkles size={18} />}
            <span className="max-w-[80%] text-center text-[11px] leading-snug">
              {busy ? (data.pipelineQueued ? t('creatorFlow.queued') : t('creatorFlow.rendering')) : shownError ?? t('creatorFlow.imageGenEmpty')}
            </span>
          </div>
        )}
        {busy && shownUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
            <Loader2 size={20} className="animate-spin text-white" />
          </div>
        )}
        {shownError && shownUrl && (
          <p className="absolute inset-x-2 top-2 rounded-md bg-black/80 px-2 py-1 text-[10px] text-white">{shownError}</p>
        )}

        <div className="absolute left-2 top-2 flex items-center gap-1.5">
          <StatusDot status={status} />
        </div>

        {/* Bottom control bar */}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 bg-gradient-to-t from-black/85 to-transparent p-2 pt-6">
          <div className="flex flex-wrap items-center gap-1">
            <div className="relative">
              <Pill active={modelOpen} onClick={readOnly ? undefined : () => setModelOpen((o) => !o)} title={t('creatorFlow.model')}>
                <span className="max-w-[120px] truncate">{modelCfg?.name ?? model}</span>
              </Pill>
              <PillMenu
                open={modelOpen}
                onClose={() => setModelOpen(false)}
                value={model}
                onSelect={(v) => updateNodeData(id, { model: v })}
                options={IMAGE_MODEL_OPTIONS.map((m) => ({ value: m.id, label: m.name, hint: m.tier }))}
              />
            </div>
            <div className="relative">
              <Pill active={ratioOpen} onClick={readOnly ? undefined : () => setRatioOpen((o) => !o)} title={t('creatorFlow.aspectRatio')}>
                {aspect}
              </Pill>
              <PillMenu open={ratioOpen} onClose={() => setRatioOpen(false)} value={aspect} onSelect={(v) => updateNodeData(id, { aspectRatio: v })} options={ASPECTS.map((a) => ({ value: a, label: a }))} />
            </div>
          </div>
          {!readOnly && (
            <button
              type="button"
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
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {t('creatorFlow.generate')}
            </button>
          )}
        </div>
      </div>

      {generations.length > 1 && (
        <div className="absolute left-1/2 top-full mt-2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-zinc-950/90 px-1 py-0.5 text-[10px] text-white/70 backdrop-blur" onMouseDown={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => step(-1)} disabled={genIdx <= 0} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-30" aria-label={t('creatorFlow.previousResult')}>
            <ChevronLeft size={12} />
          </button>
          <span className="tabular-nums">
            {genIdx + 1}/{generations.length}
          </span>
          <button type="button" onClick={() => step(1)} disabled={genIdx >= generations.length - 1} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-30" aria-label={t('creatorFlow.nextResult')}>
            <ChevronRight size={12} />
          </button>
        </div>
      )}
    </NodeCard>
  );
}
