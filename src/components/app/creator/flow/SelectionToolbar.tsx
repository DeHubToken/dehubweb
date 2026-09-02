/**
 * Creator Flow — floating actions over a multi-selection.
 * =======================================================
 * Adapted from HeliosGen's SelectionToolbar (MIT) — see LICENSE-HeliosGen.
 * Arrange into a grid, wrap in a group, duplicate or delete the lot.
 */
import { useCallback, useEffect, useState } from 'react';
import { useReactFlow, type Node } from '@xyflow/react';
import { CopyPlus, Group, LayoutGrid, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { arrangeNodes } from '@/lib/creator/flow/arrangeNodes';
import { FALLBACK_SIZE, NODE_SIZE } from '@/lib/creator/flow/nodeTypes';
import type { FlowNode, NodeData } from '@/lib/creator/flow/types';
import { uid } from '@/lib/creator/flow/types';
import { useCreatorFlowStore } from '@/store/creatorFlowStore';

const GROUP_PADDING = 28;

function bounds(nodes: Node[]) {
  if (nodes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const w = n.measured?.width ?? NODE_SIZE[n.type ?? '']?.w ?? FALLBACK_SIZE.w;
    const h = n.measured?.height ?? NODE_SIZE[n.type ?? '']?.h ?? FALLBACK_SIZE.h;
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + w);
    maxY = Math.max(maxY, n.position.y + h);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export default function SelectionToolbar() {
  const { t } = useTranslation();
  const { flowToScreenPosition } = useReactFlow();
  const nodes = useCreatorFlowStore((s) => s.nodes);
  const onNodesChange = useCreatorFlowStore((s) => s.onNodesChange);
  const addNode = useCreatorFlowStore((s) => s.addNode);
  const insertEdge = useCreatorFlowStore((s) => s.insertEdge);
  const replaceNodes = useCreatorFlowStore((s) => s.replaceNodes);

  const anyGroupSelected = nodes.some((n) => n.selected && n.type === 'groupNode');
  const selected = nodes.filter((n) => n.selected && n.type !== 'groupNode');
  const visible = selected.length >= 2 && !anyGroupSelected;

  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!visible) {
      setShown(false);
      return;
    }
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [visible]);

  const b = bounds(selected);
  const pos = b ? flowToScreenPosition({ x: b.x + b.width / 2, y: b.y }) : null;

  const handleArrange = useCallback(() => {
    const sel = useCreatorFlowStore.getState().nodes.filter((n) => n.selected && n.type !== 'groupNode');
    arrangeNodes(sel.map((n) => n.id));
  }, []);

  const handleGroup = useCallback(() => {
    const state = useCreatorFlowStore.getState();
    const sel = state.nodes.filter((n) => n.selected && n.type !== 'groupNode');
    const bb = bounds(sel);
    if (!bb) return;
    const count = (state.nodeCounters.groupNode ?? 0) + 1;
    const group: FlowNode = {
      id: `groupNode-${uid()}`,
      type: 'groupNode',
      position: { x: bb.x - GROUP_PADDING, y: bb.y - GROUP_PADDING },
      style: { width: bb.width + GROUP_PADDING * 2, height: bb.height + GROUP_PADDING * 2, zIndex: -1 },
      data: { label: `GROUP #${count}`, locked: false, memberIds: sel.map((n) => n.id) } as NodeData,
      selected: true,
      zIndex: -1,
    };
    // Group first so it paints behind its members; members keep absolute positions.
    replaceNodes([group, ...state.nodes.map((n) => ({ ...n, selected: false }))]);
    useCreatorFlowStore.setState((s) => ({ nodeCounters: { ...s.nodeCounters, groupNode: count } }));
  }, [replaceNodes]);

  const handleDelete = useCallback(() => {
    const ids = useCreatorFlowStore.getState().nodes.filter((n) => n.selected && n.type !== 'groupNode').map((n) => n.id);
    onNodesChange(ids.map((id) => ({ type: 'remove' as const, id })));
  }, [onNodesChange]);

  const handleDuplicate = useCallback(() => {
    const state = useCreatorFlowStore.getState();
    const sel = state.nodes.filter((n) => n.selected && n.type !== 'groupNode');
    const idMap: Record<string, string> = {};
    sel.forEach((n) => {
      idMap[n.id] = `${n.type}-${uid()}`;
    });
    onNodesChange(sel.map((n) => ({ type: 'select' as const, id: n.id, selected: false })));
    sel.forEach((n) => {
      addNode({
        ...n,
        id: idMap[n.id],
        position: { x: n.position.x + 24, y: n.position.y + 24 },
        selected: true,
        data: { ...n.data, label: '', status: 'idle', jobId: undefined, hasError: false } as NodeData,
      });
    });
    state.edges
      .filter((e) => idMap[e.source] && idMap[e.target])
      .forEach((e) => insertEdge({ ...e, id: `edge-${uid()}`, source: idMap[e.source], target: idMap[e.target] }));
  }, [addNode, insertEdge, onNodesChange]);

  if (!visible || !pos) return null;

  const Btn = ({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" title={title} aria-label={title} onClick={onClick} onMouseDown={(e) => e.stopPropagation()} className="flex h-7 w-7 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white">
      {children}
    </button>
  );

  return (
    <div
      className="pointer-events-auto absolute z-[150] flex items-center gap-0.5 rounded-full border border-white/10 bg-zinc-950/95 px-1.5 py-1 shadow-xl backdrop-blur-xl"
      style={{ left: pos.x, top: pos.y - 52, transform: `translateX(-50%) translateY(${shown ? 0 : 6}px)`, opacity: shown ? 1 : 0, transition: 'opacity 160ms, transform 160ms' }}
    >
      <Btn title={t('creatorFlow.arrange')} onClick={handleArrange}><LayoutGrid size={13} /></Btn>
      <Btn title={t('creatorFlow.group')} onClick={handleGroup}><Group size={13} /></Btn>
      <Btn title={t('creatorFlow.duplicateSelection')} onClick={handleDuplicate}><CopyPlus size={13} /></Btn>
      <span className="mx-0.5 h-4 w-px bg-white/10" />
      <Btn title={t('creatorFlow.deleteSelection')} onClick={handleDelete}><Trash2 size={13} /></Btn>
    </div>
  );
}
