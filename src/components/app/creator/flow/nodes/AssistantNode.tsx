/**
 * Creator Flow — assistant (text-to-text) node.
 * =============================================
 * Adapted from HeliosGen's AssistantNode (MIT) — see LICENSE-HeliosGen.
 * Rewrites a prompt — typed here or wired in from a text node — into a
 * sharper one, streamed as it arrives. Free, and works signed out.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Copy, CopyPlus, Square, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { NodeProps } from '@xyflow/react';
import { toast } from 'sonner';
import { ASSISTANT_MODELS, DEFAULT_ASSISTANT_MODEL } from '@/lib/creator/flow/assistant';
import { runAssistantNode } from '@/lib/creator/flow/runner';
import type { FlowNode, NodeData } from '@/lib/creator/flow/types';
import { uid } from '@/lib/creator/flow/types';
import { useCreatorFlowStore } from '@/store/creatorFlowStore';
import { cn } from '@/lib/utils';
import { AboveLabel, CornerResizer, IoHandle, NodeActionBar, NodeCard, Pill, PillMenu, StatusDot, useElevateWhileOpen, useHandleConnected, useInstantHandleHide } from '../NodeChrome';
import { useReadOnly } from '../FlowActionsContext';

export default function AssistantNode({ id, data, selected }: NodeProps<FlowNode>) {
  const { t } = useTranslation();
  const readOnly = useReadOnly();
  const updateNodeData = useCreatorFlowStore((s) => s.updateNodeData);
  const onNodesChange = useCreatorFlowStore((s) => s.onNodesChange);
  const addNode = useCreatorFlowStore((s) => s.addNode);
  const nodes = useCreatorFlowStore((s) => s.nodes);

  const cardRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  useInstantHandleHide(selected, cardRef);

  const [view, setView] = useState<'input' | 'output'>('input');
  const [modelOpen, setModelOpen] = useState(false);
  const [local, setLocal] = useState((data.localPrompt as string) ?? '');
  useElevateWhileOpen(cardRef, modelOpen);

  const status = data.status ?? 'idle';
  const busy = status === 'running' || !!data.pipelineQueued;
  const outputText = (data.outputText as string) ?? '';
  const model = (data.assistantModel as string) || DEFAULT_ASSISTANT_MODEL;
  const promptConnected = useHandleConnected(id, 'prompt', 'target');
  const sourceConnected = useHandleConnected(id, undefined, 'source');

  useEffect(() => {
    setLocal((data.localPrompt as string) ?? '');
  }, [data.localPrompt]);

  // Show the answer as soon as one starts arriving.
  useEffect(() => {
    if (status === 'running' || (status === 'done' && outputText)) setView('output');
  }, [status, outputText]);

  const hasPrompt = promptConnected || !!local.trim();

  const run = useCallback(async () => {
    if (busy || !hasPrompt) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const self = useCreatorFlowStore.getState().nodes.find((n) => n.id === id);
    if (!self) return;
    try {
      await runAssistantNode(self, controller.signal);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('creatorFlow.assistantFailed'));
    } finally {
      abortRef.current = null;
    }
  }, [busy, hasPrompt, id, t]);

  const stop = () => abortRef.current?.abort();

  const handleDuplicate = () => {
    const self = nodes.find((n) => n.id === id);
    if (!self) return;
    addNode({ ...self, id: `assistantNode-${uid()}`, position: { x: self.position.x + 30, y: self.position.y + 30 }, selected: true, data: { ...self.data, label: '', status: 'idle' } as NodeData });
  };

  return (
    <NodeCard cardRef={cardRef} error={!!data.hasError} onErrorEnd={() => updateNodeData(id, { hasError: false })} style={{ minWidth: 240 }}>
      {!readOnly && <CornerResizer minWidth={220} minHeight={160} />}
      <AboveLabel text={data.label as string} />
      {!readOnly && (
        <NodeActionBar
          visible={selected}
          actions={[
            { icon: <Copy size={13} />, title: t('creatorFlow.copyOutput'), onClick: () => navigator.clipboard.writeText(outputText).then(() => toast.success(t('creatorFlow.copied'))).catch(() => undefined), disabled: !outputText },
            { icon: <CopyPlus size={13} />, title: t('creatorFlow.duplicateNode'), onClick: handleDuplicate },
            { icon: <Trash2 size={13} />, title: t('creatorFlow.deleteNode'), onClick: () => onNodesChange([{ type: 'remove', id }]), separatorBefore: true },
          ]}
        />
      )}

      <IoHandle type="target" id="prompt" kind="prompt" accepts={['prompt']} connected={promptConnected} title={t('creatorFlow.handlePrompt')} />
      <IoHandle type="source" kind="prompt" connected={sourceConnected} title={t('creatorFlow.handleTextOut')} />

      <div className="flex shrink-0 items-center gap-1 px-2.5 pb-1 pt-2" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex rounded-full border border-white/10 bg-white/5 p-0.5 text-[10px] font-medium">
          {(['input', 'output'] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} className={cn('rounded-full px-2 py-0.5 transition', view === v ? 'bg-white text-black' : 'text-white/55 hover:text-white')}>
              {t(v === 'input' ? 'creatorFlow.input' : 'creatorFlow.output')}
            </button>
          ))}
        </div>
        <span className="ml-auto"><StatusDot status={status} /></span>
      </div>

      <div className="min-h-0 flex-1 px-2.5">
        <div className="nowheel h-full overflow-hidden rounded-lg border border-white/10 bg-black/40" onMouseDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
          {view === 'input' ? (
            promptConnected ? (
              <p className="p-3 text-[12px] leading-relaxed text-white/45">{t('creatorFlow.assistantWiredHint')}</p>
            ) : (
              <textarea
                value={local}
                readOnly={readOnly}
                onChange={(e) => setLocal(e.target.value)}
                onBlur={() => updateNodeData(id, { localPrompt: local })}
                placeholder={t('creatorFlow.assistantNodePlaceholder')}
                className="cflow-textarea nodrag"
              />
            )
          ) : (
            <div className="h-full overflow-y-auto whitespace-pre-wrap p-3 text-[12.5px] leading-relaxed text-white/90">
              {outputText || <span className="text-white/35">{busy ? t('creatorFlow.thinking') : t('creatorFlow.noOutputYet')}</span>}
              {busy && outputText && <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-white/70 align-text-bottom" />}
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-1 px-2.5 py-2" onMouseDown={(e) => e.stopPropagation()}>
        <div className="relative">
          <Pill active={modelOpen} onClick={readOnly ? undefined : () => setModelOpen((o) => !o)} title={t('creatorFlow.model')}>
            <Bot size={11} /> {ASSISTANT_MODELS.find((m) => m.id === model)?.label ?? model}
          </Pill>
          <PillMenu open={modelOpen} onClose={() => setModelOpen(false)} value={model} onSelect={(v) => updateNodeData(id, { assistantModel: v })} options={ASSISTANT_MODELS.map((m) => ({ value: m.id, label: m.label, hint: t(m.descKey) }))} />
        </div>
        {!readOnly && (
          busy ? (
            <button type="button" onClick={stop} className="flex h-7 items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 text-[11px] font-semibold text-white"><Square size={11} /> {t('creatorFlow.stop')}</button>
          ) : (
            <button
              type="button"
              onClick={() => void run()}
              disabled={!hasPrompt}
              className={cn('flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold transition', hasPrompt ? 'border-white/20 bg-white text-black hover:bg-zinc-200' : 'border-white/10 bg-white/5 text-white/40')}
            >
              <Bot size={12} /> {t('creatorFlow.improve')}
            </button>
          )
        )}
      </div>
    </NodeCard>
  );
}
