/**
 * Creator Flow — read-only view of a shared flow.
 * ===============================================
 * Adapted from HeliosGen's PublicWorkflowViewer (MIT) — see LICENSE-HeliosGen.
 * Visitors pan, zoom and inspect; nothing edits or generates. "Open a copy"
 * drops the whole graph into the visitor's own flows.
 */
import { useEffect, useState } from 'react';
import { Background, BackgroundVariant, Controls, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Copy, Hand, MousePointer2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { fetchPublicFlow, type PublicFlow } from '@/lib/creator/flow/api';
import { useCreatorFlowStore } from '@/store/creatorFlowStore';
import { cn } from '@/lib/utils';
import { FlowActionsContext } from './FlowActionsContext';
import { edgeTypes, nodeTypes } from './registry';
import './flow.css';

interface Props {
  id: string;
  onLoaded?: (flow: PublicFlow) => void;
}

const READ_ONLY = { runNodes: () => undefined, readOnly: true };

export default function PublicFlowViewer({ id, onLoaded }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [flow, setFlow] = useState<PublicFlow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<'select' | 'hand'>('hand');
  const createFlow = useCreatorFlowStore((s) => s.createFlow);

  useEffect(() => {
    let cancelled = false;
    setFlow(null);
    setError(null);
    fetchPublicFlow(id)
      .then((f) => {
        if (cancelled) return;
        setFlow(f);
        onLoaded?.(f);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t('creatorFlow.notFound'));
      });
    return () => {
      cancelled = true;
    };
  }, [id, onLoaded, t]);

  const openCopy = () => {
    if (!flow) return;
    const counters: Record<string, number> = {};
    for (const n of flow.nodes) counters[n.type ?? 'node'] = (counters[n.type ?? 'node'] ?? 0) + 1;
    createFlow(`${flow.name} (copy)`, {
      nodes: flow.nodes.map((n) => ({ ...n, selected: false, data: { ...n.data, status: 'idle', jobId: undefined, pendingGenerate: false, pipelineQueued: false } })),
      edges: flow.edges,
      nodeCounters: counters,
    });
    navigate('/creator/flow');
  };

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#090a0b] text-[14px] text-white/45">{error}</div>
    );
  }
  if (!flow) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#090a0b]">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
      </div>
    );
  }

  const readOnlyNodes = flow.nodes.map((n) => ({ ...n, draggable: false, connectable: false, selectable: tool === 'select' }));

  return (
    <FlowActionsContext.Provider value={READ_ONLY}>
      <div className={cn('cflow relative h-full w-full', tool === 'hand' && 'canvas-hand-mode')}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={readOnlyNodes}
            edges={flow.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultViewport={flow.viewport ?? { x: 0, y: 0, zoom: 1 }}
            fitView={!flow.viewport}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={tool === 'select'}
            panOnDrag={tool === 'hand' ? [0, 1, 2] : [1, 2]}
            selectionOnDrag={tool === 'select'}
            zoomOnScroll
            zoomOnPinch
            minZoom={0.05}
            colorMode="dark"
            proOptions={{ hideAttribution: true }}
            style={{ background: 'transparent' }}
          >
            <Background variant={BackgroundVariant.Dots} gap={28} size={1.4} color="rgba(255,255,255,0.18)" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </ReactFlowProvider>

        <div className="absolute left-4 top-1/2 z-[100] flex -translate-y-1/2 flex-col items-center gap-0.5 rounded-2xl border border-white/10 bg-zinc-950/90 px-[5px] py-2 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl">
          {(['select', 'hand'] as const).map((tl) => (
            <button
              key={tl}
              type="button"
              title={tl === 'select' ? t('creatorFlow.toolSelect') : t('creatorFlow.toolHand')}
              aria-label={tl === 'select' ? t('creatorFlow.toolSelect') : t('creatorFlow.toolHand')}
              onClick={() => setTool(tl)}
              className={cn('flex h-[34px] w-[34px] items-center justify-center rounded-[10px] transition', tool === tl ? 'bg-white text-black' : 'text-white/60 hover:bg-white/10 hover:text-white')}
            >
              {tl === 'select' ? <MousePointer2 size={15} strokeWidth={1.8} /> : <Hand size={15} strokeWidth={1.8} />}
            </button>
          ))}
        </div>

        <div className="absolute right-4 top-4 z-[100] flex items-center gap-2">
          <button
            type="button"
            onClick={openCopy}
            className="flex h-9 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 text-[13px] font-medium text-white backdrop-blur-xl transition hover:border-white/40 hover:bg-white/20"
          >
            <Copy size={14} /> {t('creatorFlow.openACopy')}
          </button>
        </div>

        <div className="pointer-events-none absolute bottom-4 right-4 z-[100] text-[11px] text-white/30">{flow.name}</div>
      </div>
    </FlowActionsContext.Provider>
  );
}
