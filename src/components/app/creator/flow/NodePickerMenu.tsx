/**
 * Creator Flow — the picker that appears when a wire is dropped on empty canvas.
 * ==============================================================================
 * Offers only the node types the dragged handle can connect to, creates the
 * chosen one under the cursor and wires it up in one move.
 */
import { useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { edgeStyle } from '@/lib/creator/flow/edgeStyles';
import { NODES, getDefaultNodeSize, getLastNodeSettings } from '@/lib/creator/flow/nodeTypes';
import { uid } from '@/lib/creator/flow/types';
import { useCreatorFlowStore } from '@/store/creatorFlowStore';

export interface DropState {
  screenX: number;
  screenY: number;
  sourceNodeId: string;
  sourceNodeType: string | undefined;
  sourceHandleId: string | null;
  /** True when the drag started from an input handle. */
  isInputHandle?: boolean;
}

interface Props {
  dropState: DropState;
  onClose: () => void;
}

/** Which input on `targetType` a wire from `sourceType`/`sourceHandle` lands on. */
function targetHandleFor(sourceType: string | undefined, sourceHandle: string | null, targetType: string): string | null {
  const textSource = sourceType === 'promptNode' || sourceType === 'assistantNode';
  const imageSource = sourceType === 'imageInputNode' || sourceType === 'imageGenNode' || sourceHandle === 'frame';
  const videoSource = sourceHandle === 'video';
  if (textSource) return targetType === 'imageGenNode' || targetType === 'videoGenNode' || targetType === 'assistantNode' ? 'prompt' : null;
  if (imageSource) {
    if (targetType === 'videoGenNode') return 'startFrame';
    if (targetType === 'imageGenNode') return 'image';
    return null;
  }
  if (videoSource) return targetType === 'videoGenNode' ? 'referenceVideo' : null;
  return null;
}

/** Which node types can be a source for the given input handle. */
function sourceTypesFor(targetHandle: string | null): string[] {
  switch (targetHandle) {
    case 'prompt':
      return ['promptNode', 'assistantNode'];
    case 'image':
    case 'startFrame':
    case 'endFrame':
      return ['imageInputNode', 'imageGenNode', 'videoInputNode', 'videoGenNode'];
    case 'referenceVideo':
      return ['videoInputNode', 'videoGenNode'];
    default:
      return [];
  }
}

export default function NodePickerMenu({ dropState, onClose }: Props) {
  const { t } = useTranslation();
  const { screenToFlowPosition } = useReactFlow();
  const addNode = useCreatorFlowStore((s) => s.addNode);
  const insertEdge = useCreatorFlowStore((s) => s.insertEdge);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Deferred so the mouseup that ended the drag does not close it at once.
    const t0 = setTimeout(() => document.addEventListener('mousedown', onDown, true), 50);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t0);
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const candidates = dropState.isInputHandle
    ? NODES.filter((n) => sourceTypesFor(dropState.sourceHandleId).includes(n.type))
    : NODES.filter((n) => n.canReceiveConnection && targetHandleFor(dropState.sourceNodeType, dropState.sourceHandleId, n.type) !== null);

  const pick = (type: string) => {
    const state = useCreatorFlowStore.getState();
    const size = getDefaultNodeSize(type, state.lastNodeSize);
    const pos = screenToFlowPosition({ x: dropState.screenX, y: dropState.screenY });
    const id = `${type}-${uid()}`;
    // Drop point is where the wire ended: for a new target that is its left
    // edge, for a new source its right edge.
    const x = dropState.isInputHandle ? pos.x - size.w : pos.x;
    addNode({
      id,
      type,
      position: { x, y: pos.y - size.h / 2 },
      style: type === 'imageInputNode' || type === 'videoInputNode' ? { width: size.w } : { width: size.w, height: size.h },
      data: { label: '', status: 'idle', ...getLastNodeSettings(type, state.nodes) },
    });

    if (dropState.isInputHandle) {
      const sourceHandle = type === 'videoInputNode' || type === 'videoGenNode' ? (dropState.sourceHandleId === 'referenceVideo' ? 'video' : 'frame') : undefined;
      insertEdge({
        id: `edge-${uid()}`,
        source: id,
        sourceHandle,
        target: dropState.sourceNodeId,
        targetHandle: dropState.sourceHandleId ?? undefined,
        animated: false,
        style: edgeStyle(dropState.sourceHandleId),
      });
    } else {
      const targetHandle = targetHandleFor(dropState.sourceNodeType, dropState.sourceHandleId, type);
      insertEdge({
        id: `edge-${uid()}`,
        source: dropState.sourceNodeId,
        sourceHandle: dropState.sourceHandleId ?? undefined,
        target: id,
        targetHandle: targetHandle ?? undefined,
        animated: false,
        style: edgeStyle(targetHandle),
      });
    }
    onClose();
  };

  return (
    <div
      ref={ref}
      className="cflow-fade-up fixed z-[300] w-[240px] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl"
      style={{ left: Math.min(dropState.screenX + 8, window.innerWidth - 256), top: Math.min(dropState.screenY - 12, window.innerHeight - 300) }}
      role="menu"
    >
      <p className="border-b border-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">{t('creatorFlow.connectTo')}</p>
      <div className="p-1.5">
        {candidates.length === 0 && <p className="px-3 py-4 text-center text-[12px] text-white/40">{t('creatorFlow.nothingConnects')}</p>}
        {candidates.map((n) => (
          <button key={n.type} type="button" role="menuitem" onClick={() => pick(n.type)} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/10">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white">{n.icon}</span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-white">{t(n.labelKey)}</span>
              <span className="block truncate text-[11px] text-white/45">{t(n.descriptionKey)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
