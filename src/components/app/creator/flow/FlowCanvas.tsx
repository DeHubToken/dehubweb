/**
 * Creator Flow — the canvas.
 * ==========================
 * Adapted from HeliosGen's WorkflowCanvas (MIT) — see LICENSE-HeliosGen.
 *
 * React Flow with the store as its source of truth, plus everything that
 * makes a canvas feel finished: alignment snapping with guide lines, ancestor
 * highlighting for the selection, delete animation, copy/paste (text on the
 * clipboard becomes a text node), file drop, the "+" menu, the picker when a
 * wire is dropped on nothing, undo/redo, select/hand tools, and Run — which
 * prices the graph, takes one payment and executes it wave by wave.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type OnNodeDrag,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Clapperboard, Loader2, MessageSquare, Play, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { edgeStyle } from '@/lib/creator/flow/edgeStyles';
import { nodeAcceptsPromptInput } from '@/lib/creator/flow/executor';
import { FALLBACK_SIZE, NODE_SIZE, getDefaultNodeSize, getLastNodeSettings } from '@/lib/creator/flow/nodeTypes';
import { executeRun, findIssues, planRun, FlowRunError, type RunPlan } from '@/lib/creator/flow/runner';
import { requestFlowSync } from '@/lib/creator/flow/syncBus';
import type { FlowEdge, FlowNode, NodeData } from '@/lib/creator/flow/types';
import { GEN_NODE_TYPES, uid } from '@/lib/creator/flow/types';
import { useCreatorFlowStore } from '@/store/creatorFlowStore';
import { cn } from '@/lib/utils';
import AddNodeMenu from './AddNodeMenu';
import CanvasToolbar, { type ToolId } from './CanvasToolbar';
import { FlowActionsContext } from './FlowActionsContext';
import FlowPaywall from './FlowPaywall';
import NodePickerMenu, { type DropState } from './NodePickerMenu';
import SelectionToolbar from './SelectionToolbar';
import ShareModal from './ShareModal';
import { edgeTypes, nodeTypes } from './registry';
import './flow.css';

const SNAP_THRESHOLD = 8;

interface SnapGuide {
  type: 'h' | 'v';
  canvasPos: number;
}

/** Restore the saved viewport whenever the active flow changes. */
function ViewportSyncer() {
  const { setViewport, fitView } = useReactFlow();
  const activeFlowId = useCreatorFlowStore((s) => s.activeFlowId);
  useEffect(() => {
    const flow = useCreatorFlowStore.getState().flows.find((f) => f.id === activeFlowId);
    if (flow?.viewport) setViewport(flow.viewport, { duration: 0 });
    else if (flow && flow.nodes.length > 0) void fitView({ duration: 0, padding: 0.2 });
    else setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 0 });
  }, [activeFlowId, setViewport, fitView]);
  return null;
}

/** Dashed outline around a would-be group when a connected node is clicked. */
function GroupPreviewOverlay({ groupIds }: { groupIds: Set<string> | null }) {
  const { getNodes } = useReactFlow();
  const { x: vpX, y: vpY, zoom } = useViewport();
  if (!groupIds || groupIds.size === 0) return null;
  const relevant = getNodes().filter((n) => groupIds.has(n.id));
  if (relevant.length === 0) return null;
  const PAD = 28;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of relevant) {
    const w = n.measured?.width ?? NODE_SIZE[n.type ?? '']?.w ?? FALLBACK_SIZE.w;
    const h = n.measured?.height ?? NODE_SIZE[n.type ?? '']?.h ?? FALLBACK_SIZE.h;
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + w);
    maxY = Math.max(maxY, n.position.y + h);
  }
  return (
    <div
      className="pointer-events-none absolute z-0 rounded-2xl border-2 border-dashed border-white/25"
      style={{ left: (minX - PAD) * zoom + vpX, top: (minY - PAD) * zoom + vpY, width: (maxX - minX + PAD * 2) * zoom, height: (maxY - minY + PAD * 2) * zoom }}
    />
  );
}

/** Kind of data a source handle emits. */
function sourceKind(node: FlowNode | undefined, handle: string | null | undefined): 'prompt' | 'image' | 'video' | null {
  if (!node) return null;
  if (node.type === 'promptNode' || node.type === 'assistantNode') return 'prompt';
  if (node.type === 'imageInputNode' || node.type === 'imageGenNode') return 'image';
  if (node.type === 'videoInputNode' || node.type === 'videoGenNode') return handle === 'frame' ? 'image' : 'video';
  return null;
}

/** What each input handle accepts and how many. */
const TARGET_RULES: Record<string, Record<string, { kind: 'prompt' | 'image' | 'video'; max: number }>> = {
  imageGenNode: { prompt: { kind: 'prompt', max: 1 }, image: { kind: 'image', max: 1 } },
  videoGenNode: {
    prompt: { kind: 'prompt', max: 1 },
    startFrame: { kind: 'image', max: 1 },
    endFrame: { kind: 'image', max: 1 },
    image: { kind: 'image', max: 4 },
    referenceVideo: { kind: 'video', max: 2 },
  },
  assistantNode: { prompt: { kind: 'prompt', max: 1 } },
};

interface CanvasProps {
  onOpenLogin: () => void;
  signedIn: boolean;
  onSyncNow: () => void | Promise<void>;
}

function FlowCanvasInner({ onOpenLogin, signedIn, onSyncNow }: CanvasProps) {
  const { t } = useTranslation();
  const nodes = useCreatorFlowStore((s) => s.nodes);
  const edges = useCreatorFlowStore((s) => s.edges);
  const storeNodesChange = useCreatorFlowStore((s) => s.onNodesChange);
  const storeEdgesChange = useCreatorFlowStore((s) => s.onEdgesChange);
  const onConnect = useCreatorFlowStore((s) => s.onConnect);
  const addNode = useCreatorFlowStore((s) => s.addNode);
  const insertEdge = useCreatorFlowStore((s) => s.insertEdge);
  const updateNodeData = useCreatorFlowStore((s) => s.updateNodeData);
  const isRunning = useCreatorFlowStore((s) => s.isRunning);
  const setConnectingHandleType = useCreatorFlowStore((s) => s.setConnectingHandleType);
  const saveViewportStore = useCreatorFlowStore((s) => s.saveViewport);
  const pushUndoSnapshot = useCreatorFlowStore((s) => s.pushUndoSnapshot);
  const undo = useCreatorFlowStore((s) => s.undo);
  const redo = useCreatorFlowStore((s) => s.redo);
  const canUndo = useCreatorFlowStore((s) => s.undoStack.length > 0);
  const canRedo = useCreatorFlowStore((s) => s.redoStack.length > 0);
  const activeFlowId = useCreatorFlowStore((s) => s.activeFlowId);
  const activeIsPublic = useCreatorFlowStore((s) => s.flows.find((f) => f.id === s.activeFlowId)?.isPublic ?? false);

  const [activeTool, setActiveTool] = useState<ToolId>('select');
  const [dyingEdgeIds, setDyingEdgeIds] = useState<Set<string>>(new Set());
  const [dyingNodeIds, setDyingNodeIds] = useState<Set<string>>(new Set());
  const [ancestorIds, setAncestorIds] = useState<Set<string>>(new Set());
  const [ancestorEdgeIds, setAncestorEdgeIds] = useState<Set<string>>(new Set());
  const [potentialGroupIds, setPotentialGroupIds] = useState<Set<string> | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRubberBand, setIsRubberBand] = useState(false);
  const [dropState, setDropState] = useState<DropState | null>(null);
  const [addMenuAnchor, setAddMenuAnchor] = useState<DOMRect | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [log, setLog] = useState<{ text: string; ok: boolean }[]>([]);
  const [plan, setPlan] = useState<RunPlan | null>(null);
  const [planning, setPlanning] = useState(false);

  const selectedIdsRef = useRef<Set<string>>(new Set());
  const rubberBandRef = useRef(false);
  const suppressedEdgeRemoves = useRef<Set<string>>(new Set());
  const snapTargetRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  const mousePosRef = useRef({ x: 0, y: 0 });
  const clipboardRef = useRef<{ nodes: FlowNode[]; edges: FlowEdge[] } | null>(null);
  const sentinelRef = useRef<string | null>(null);
  const saveViewportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveViewport = useCallback(
    (vp: Viewport) => {
      if (saveViewportTimer.current) clearTimeout(saveViewportTimer.current);
      saveViewportTimer.current = setTimeout(() => saveViewportStore(vp), 300);
    },
    [saveViewportStore],
  );

  const push = useCallback((text: string, ok = true) => setLog((l) => [...l.slice(-60), { text, ok }]), []);

  // ── Selection → ancestor highlight ─────────────────────────────────────
  const runAncestorBFS = useCallback(() => {
    const selectedIds = selectedIdsRef.current;
    if (selectedIds.size === 0) {
      setAncestorIds(new Set());
      setAncestorEdgeIds(new Set());
      return;
    }
    const visitedNodes = new Set<string>();
    const visitedEdges = new Set<string>();
    const queue = [...selectedIds];
    while (queue.length > 0) {
      const id = queue.shift()!;
      for (const edge of edges) {
        if (edge.target !== id) continue;
        visitedEdges.add(edge.id);
        if (!selectedIds.has(edge.source) && !visitedNodes.has(edge.source)) {
          visitedNodes.add(edge.source);
          queue.push(edge.source);
        }
      }
    }
    setAncestorIds(visitedNodes);
    setAncestorEdgeIds(visitedEdges);
  }, [edges]);

  const onSelectionChange = useCallback(
    ({ nodes: selected }: { nodes: Node[] }) => {
      selectedIdsRef.current = new Set(selected.map((n) => n.id));
      if (rubberBandRef.current) return;
      const groups = selected.filter((n) => n.type === 'groupNode');
      if (groups.length > 0) {
        const toSelect: string[] = [];
        for (const g of groups) (g.data?.memberIds as string[] | undefined)?.forEach((m) => { if (!selectedIdsRef.current.has(m)) toSelect.push(m); });
        if (toSelect.length > 0) storeNodesChange(toSelect.map((id) => ({ type: 'select' as const, id, selected: true })));
      }
      if (selected.length === 0) {
        setAncestorIds(new Set());
        setAncestorEdgeIds(new Set());
        return;
      }
      runAncestorBFS();
    },
    [runAncestorBFS, storeNodesChange],
  );

  // ── Edge changes with delete animation ─────────────────────────────────
  const handleEdgesChange = useCallback(
    (changes: EdgeChange<FlowEdge>[]) => {
      const filtered = changes.filter((c) => c.type !== 'remove' || !suppressedEdgeRemoves.current.has(c.id));
      if (filtered.length > 0) storeEdgesChange(filtered);
    },
    [storeEdgesChange],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      const removes = changes.filter((c) => c.type === 'remove');
      if (removes.length > 0) {
        pushUndoSnapshot();
        const removingIds = new Set(removes.map((c) => c.id));
        const connectedEdgeIds = edges.filter((e) => removingIds.has(e.source) || removingIds.has(e.target)).map((e) => e.id);
        connectedEdgeIds.forEach((id) => suppressedEdgeRemoves.current.add(id));
        setDyingNodeIds((prev) => new Set([...prev, ...removingIds]));
        setDyingEdgeIds((prev) => new Set([...prev, ...connectedEdgeIds]));
        setTimeout(() => {
          storeNodesChange(removes);
          storeEdgesChange(connectedEdgeIds.map((id) => ({ type: 'remove' as const, id })));
          connectedEdgeIds.forEach((id) => suppressedEdgeRemoves.current.delete(id));
          setDyingNodeIds((prev) => { const s = new Set(prev); removingIds.forEach((id) => s.delete(id)); return s; });
          setDyingEdgeIds((prev) => { const s = new Set(prev); connectedEdgeIds.forEach((id) => s.delete(id)); return s; });
        }, 300);
      }

      const rest = changes.filter((c) => c.type !== 'remove');
      if (rest.length === 0) return;

      // Alignment snap: edges of the dragged node to edges of every other.
      const guides: SnapGuide[] = [];
      const snapped = rest.map((change) => {
        if (change.type !== 'position' || !change.position) return change;
        if (!change.dragging) {
          const tgt = snapTargetRef.current;
          if (tgt && tgt.id === change.id) return { ...change, position: { x: tgt.x, y: tgt.y } };
          return change;
        }
        const dragged = nodes.find((n) => n.id === change.id);
        if (!dragged) return change;
        const dw = dragged.measured?.width ?? (NODE_SIZE[dragged.type ?? ''] ?? FALLBACK_SIZE).w;
        const dh = dragged.measured?.height ?? (NODE_SIZE[dragged.type ?? ''] ?? FALLBACK_SIZE).h;
        const { x, y } = change.position;
        let snapX: number | null = null;
        let guideX: number | null = null;
        let minDX = SNAP_THRESHOLD;
        let snapY: number | null = null;
        let guideY: number | null = null;
        let minDY = SNAP_THRESHOLD;
        for (const other of nodes) {
          if (other.id === change.id) continue;
          const ow = other.measured?.width ?? (NODE_SIZE[other.type ?? ''] ?? FALLBACK_SIZE).w;
          const oh = other.measured?.height ?? (NODE_SIZE[other.type ?? ''] ?? FALLBACK_SIZE).h;
          for (const [dx, off] of [[x, 0], [x + dw, dw]] as [number, number][]) {
            for (const ox of [other.position.x, other.position.x + ow]) {
              const dist = Math.abs(dx - ox);
              if (dist < minDX) { minDX = dist; snapX = ox - off; guideX = ox; }
            }
          }
          for (const [dy, off] of [[y, 0], [y + dh, dh]] as [number, number][]) {
            for (const oy of [other.position.y, other.position.y + oh]) {
              const dist = Math.abs(dy - oy);
              if (dist < minDY) { minDY = dist; snapY = oy - off; guideY = oy; }
            }
          }
        }
        if (guideX !== null) guides.push({ type: 'v', canvasPos: guideX });
        if (guideY !== null) guides.push({ type: 'h', canvasPos: guideY });
        const sx = snapX ?? x;
        const sy = snapY ?? y;
        snapTargetRef.current = guideX !== null || guideY !== null ? { id: change.id, x: sx, y: sy } : null;
        return { ...change, position: { x: sx, y: sy } };
      });

      // A moving group takes its members along.
      const extra: NodeChange<FlowNode>[] = [];
      for (const change of snapped) {
        if (change.type !== 'position' || !change.position) continue;
        const node = nodes.find((n) => n.id === change.id);
        if (node?.type !== 'groupNode') continue;
        const memberIds = node.data?.memberIds as string[] | undefined;
        if (!memberIds?.length) continue;
        const dx = change.position.x - node.position.x;
        const dy = change.position.y - node.position.y;
        for (const mid of memberIds) {
          const m = nodes.find((n) => n.id === mid);
          if (m) extra.push({ type: 'position', id: mid, position: { x: m.position.x + dx, y: m.position.y + dy }, dragging: change.dragging });
        }
      }
      setSnapGuides(guides);
      storeNodesChange(extra.length > 0 ? [...snapped, ...extra] : snapped);
    },
    [nodes, edges, storeNodesChange, storeEdgesChange, pushUndoSnapshot],
  );

  // ── Drop (files, or a node type dragged from the menu) ─────────────────
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      const { x: panX, y: panY, zoom } = viewportRef.current;
      const toFlow = (cx: number, cy: number) => ({ x: (cx - rect.left - panX) / zoom, y: (cy - rect.top - panY) / zoom });

      const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
      if (files.length > 0) {
        const at = toFlow(e.clientX, e.clientY);
        const lastNodeSize = useCreatorFlowStore.getState().lastNodeSize;
        const GAP = 24;
        const meta = files.map((file) => {
          const type = file.type.startsWith('image/') ? 'imageInputNode' : 'videoInputNode';
          return { file, type, size: getDefaultNodeSize(type, lastNodeSize) };
        });
        const totalW = meta.reduce((s, m, i) => s + m.size.w + (i < meta.length - 1 ? GAP : 0), 0);
        let cursorX = at.x - totalW / 2;
        for (const { file, type, size } of meta) {
          const id = `${type}-${uid()}`;
          const objectUrl = URL.createObjectURL(file);
          addNode({
            id,
            type,
            position: { x: cursorX, y: at.y - size.h / 2 },
            style: { width: size.w },
            data: type === 'imageInputNode' ? { label: '', status: 'idle', inputImage: objectUrl } : { label: '', status: 'idle', videoUrl: objectUrl },
          });
          cursorX += size.w + GAP;
          // The node hosts the file itself; hand it over as a data URL so the
          // durable link replaces the blob before anything is saved.
          const reader = new FileReader();
          reader.onload = () => {
            if (type === 'imageInputNode') updateNodeData(id, { inputImage: String(reader.result) });
          };
          if (type === 'imageInputNode') reader.readAsDataURL(file);
        }
        return;
      }

      const type = e.dataTransfer.getData('application/dehub-flow-node');
      if (!type) return;
      const position = toFlow(e.clientX, e.clientY);
      const state = useCreatorFlowStore.getState();
      const size = getDefaultNodeSize(type, state.lastNodeSize);
      addNode({
        id: `${type}-${uid()}`,
        type,
        position,
        style: type === 'imageInputNode' || type === 'videoInputNode' ? { width: size.w } : { width: size.w, height: size.h },
        data: { label: '', status: 'idle', ...getLastNodeSettings(type, state.nodes) },
      });
    },
    [addNode, updateNodeData],
  );

  // ── Copy / paste ───────────────────────────────────────────────────────
  const handleCopy = useCallback(() => {
    const selected = nodes.filter((n) => n.selected);
    if (selected.length === 0) return;
    const ids = new Set(selected.map((n) => n.id));
    for (const n of selected) if (n.type === 'groupNode') ((n.data?.memberIds as string[] | undefined) ?? []).forEach((m) => ids.add(m));
    clipboardRef.current = { nodes: nodes.filter((n) => ids.has(n.id)), edges: edges.filter((e) => ids.has(e.source) && ids.has(e.target)) };
    const sentinel = `__dehub_flow_nodes_${Date.now()}__`;
    sentinelRef.current = sentinel;
    navigator.clipboard.writeText(sentinel).catch(() => undefined);
  }, [nodes, edges]);

  const handlePasteNodes = useCallback(() => {
    if (!clipboardRef.current) return;
    const { nodes: copied, edges: copiedEdges } = clipboardRef.current;
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { x: panX, y: panY, zoom } = viewportRef.current;
    const cursor = { x: (mousePosRef.current.x - rect.left - panX) / zoom, y: (mousePosRef.current.y - rect.top - panY) / zoom };
    const xs = copied.map((n) => n.position.x);
    const ys = copied.map((n) => n.position.y);
    const centre = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    const idMap = new Map<string, string>();
    for (const n of copied) idMap.set(n.id, `${n.type}-${uid()}`);
    for (const n of copied) {
      const data: NodeData = { ...n.data, label: '', status: n.data.status === 'running' ? 'idle' : n.data.status, jobId: undefined };
      if (n.type === 'groupNode') data.memberIds = ((n.data.memberIds as string[] | undefined) ?? []).map((m) => idMap.get(m) ?? m);
      addNode({ ...n, id: idMap.get(n.id)!, selected: false, position: { x: cursor.x + (n.position.x - centre.x), y: cursor.y + (n.position.y - centre.y) }, data });
    }
    for (const e of copiedEdges) {
      const src = idMap.get(e.source);
      const tgt = idMap.get(e.target);
      if (src && tgt) insertEdge({ ...e, id: `edge-${uid()}`, source: src, target: tgt });
    }
  }, [addNode, insertEdge]);

  const pasteTextAsNode = useCallback(
    (text: string) => {
      const state = useCreatorFlowStore.getState();
      const size = getDefaultNodeSize('promptNode', state.lastNodeSize);
      const selected = state.nodes.filter((n) => n.selected);
      const target = selected.length === 1 ? selected[0] : null;
      const accepts = target ? nodeAcceptsPromptInput(target, state.edges) : false;
      const newId = `promptNode-${uid()}`;
      let position: { x: number; y: number };
      if (target && accepts) {
        const th = target.measured?.height ?? NODE_SIZE[target.type ?? '']?.h ?? FALLBACK_SIZE.h;
        position = { x: target.position.x - size.w - 60, y: target.position.y + (th - size.h) / 2 };
      } else {
        const rect = wrapperRef.current?.getBoundingClientRect();
        if (!rect) return;
        const { x: panX, y: panY, zoom } = viewportRef.current;
        position = { x: (mousePosRef.current.x - rect.left - panX) / zoom - size.w / 2, y: (mousePosRef.current.y - rect.top - panY) / zoom - size.h / 2 };
      }
      addNode({ id: newId, type: 'promptNode', position, style: { width: size.w, height: size.h }, data: { label: '', prompt: text } });
      if (target && accepts) insertEdge({ id: `edge-${uid()}`, source: newId, target: target.id, targetHandle: 'prompt', animated: false, style: edgeStyle('prompt') });
    },
    [addNode, insertEdge],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const editable = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;
      if (editable) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod && !e.altKey) {
        if (e.key === 'v' || e.key === 'V') setActiveTool('select');
        if (e.key === 'h' || e.key === 'H') setActiveTool('hand');
        if (e.key === 'a' || e.key === 'A') {
          const btn = document.querySelector('[data-flow-add]') as HTMLElement | null;
          if (btn) setAddMenuAnchor(btn.getBoundingClientRect());
        }
      }
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redo();
      }
      if (mod && e.key === 'c') {
        e.preventDefault();
        handleCopy();
      }
      if (mod && e.key === 'v') {
        e.preventDefault();
        navigator.clipboard
          .readText?.()
          .then((raw) => {
            const text = raw.trim();
            if (text && text !== sentinelRef.current) pasteTextAsNode(text);
            else if (clipboardRef.current) handlePasteNodes();
          })
          .catch(() => {
            if (clipboardRef.current) handlePasteNodes();
          });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleCopy, handlePasteNodes, pasteTextAsNode, undo, redo]);

  // ── Connections ────────────────────────────────────────────────────────
  const isValidConnection = useCallback(
    (c: Connection | Edge) => {
      if (c.source === c.target) return false;
      const source = nodes.find((n) => n.id === c.source);
      const target = nodes.find((n) => n.id === c.target);
      if (!source || !target) return false;
      const kind = sourceKind(source, c.sourceHandle);
      const rules = TARGET_RULES[target.type ?? ''];
      const rule = rules?.[c.targetHandle ?? ''];
      if (!kind || !rule || rule.kind !== kind) return false;
      const existing = edges.filter((e) => e.target === c.target && e.targetHandle === c.targetHandle);
      if (existing.length >= rule.max) return false;
      if (existing.some((e) => e.source === c.source && (e.sourceHandle ?? null) === (c.sourceHandle ?? null))) return false;
      return true;
    },
    [nodes, edges],
  );

  const onConnectStart = useCallback(
    (event: MouseEvent | TouchEvent, params: { nodeId: string | null; handleId: string | null; handleType: 'source' | 'target' | null }) => {
      const rf = (event.target as HTMLElement)?.closest?.('.react-flow') as HTMLElement | null;
      const node = nodes.find((n) => n.id === params.nodeId);
      let kind: string | null = null;
      if (params.handleType === 'source') kind = sourceKind(node, params.handleId);
      else if (node) kind = TARGET_RULES[node.type ?? '']?.[params.handleId ?? '']?.kind ?? null;
      if (rf && kind && params.handleType === 'source') rf.setAttribute('data-connecting-type', kind);
      setConnectingHandleType(kind);
      setIsConnecting(true);
      (event.target as HTMLElement)?.closest?.('.react-flow__handle')?.classList.add('is-connecting');
    },
    [nodes, setConnectingHandleType],
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: { toHandle?: unknown; isValid?: boolean | null; fromNode?: { id: string; type?: string } | null; fromHandle?: { id?: string | null; type?: string } | null }) => {
      const rf = (event.target as HTMLElement)?.closest?.('.react-flow') as HTMLElement | null;
      rf?.removeAttribute('data-connecting-type');
      document.querySelectorAll('.react-flow__handle.is-connecting').forEach((el) => el.classList.remove('is-connecting'));
      setConnectingHandleType(null);
      setIsConnecting(false);
      if (state.toHandle || state.isValid || !state.fromNode) return;
      const { clientX, clientY } = 'changedTouches' in event ? (event as TouchEvent).changedTouches[0] : (event as MouseEvent);
      setDropState({
        screenX: clientX,
        screenY: clientY,
        sourceNodeId: state.fromNode.id,
        sourceNodeType: state.fromNode.type,
        sourceHandleId: state.fromHandle?.id ?? null,
        isInputHandle: state.fromHandle?.type === 'target',
      });
    },
    [setConnectingHandleType],
  );

  // ── Run ────────────────────────────────────────────────────────────────
  const flagIssues = useCallback(
    (ids: string[]) => {
      const issues = findIssues(ids);
      for (const issue of issues) {
        updateNodeData(issue.nodeId, { hasError: true });
        if (issue.sourceId) updateNodeData(issue.sourceId, { hasError: true });
        if (issue.edgeId) useCreatorFlowStore.getState().flashEdgeError(issue.edgeId);
      }
      if (issues[0]) toast.error(t(issues[0].key));
      return issues.length > 0;
    },
    [t, updateNodeData],
  );

  const runNodes = useCallback(
    async (ids: string[]) => {
      if (isRunning || planning) return;
      if (flagIssues(ids)) return;
      setPlanning(true);
      try {
        const p = await planRun(ids);
        setPlan(p);
      } catch (e) {
        if (e instanceof FlowRunError && e.code === 'SIGN_IN_REQUIRED') {
          toast.message(t('creatorFlow.signInToGenerate'));
          onOpenLogin();
        } else if (e instanceof FlowRunError && e.code === 'EMPTY') {
          toast.message(t('creatorFlow.nothingToRun'));
        } else {
          toast.error(e instanceof Error ? e.message : t('creatorFlow.planFailed'));
        }
      } finally {
        setPlanning(false);
      }
    },
    [flagIssues, isRunning, planning, onOpenLogin, t],
  );

  const confirmRun = useCallback(
    async (txHash: string | undefined) => {
      const p = plan;
      setPlan(null);
      if (!p) return;
      setLog([]);
      push(t('creatorFlow.logRunning'));
      const { failures } = await executeRun(p, txHash, { onLog: push });
      push(failures > 0 ? t('creatorFlow.logFinishedWithFailures', { count: failures }) : t('creatorFlow.logComplete'), failures === 0);
      if (failures > 0) toast.error(t('creatorFlow.runFailures', { count: failures }));
      else toast.success(t('creatorFlow.runComplete'));
      requestFlowSync();
    },
    [plan, push, t],
  );

  const runAll = useCallback(() => {
    const ids = nodes.filter((n) => GEN_NODE_TYPES.has(n.type ?? '')).map((n) => n.id);
    void runNodes(ids);
  }, [nodes, runNodes]);

  const actions = useMemo(() => ({ runNodes: (ids: string[]) => void runNodes(ids), readOnly: false }), [runNodes]);

  // ── Placing from the empty state ───────────────────────────────────────
  const addNodeAtCenter = useCallback(
    (type: string) => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      const { x: panX, y: panY, zoom } = viewportRef.current;
      const cx = (rect.width / 2 - panX) / zoom;
      const cy = (rect.height / 2 - panY) / zoom;
      const state = useCreatorFlowStore.getState();
      const size = getDefaultNodeSize(type, state.lastNodeSize);
      addNode({
        id: `${type}-${uid()}`,
        type,
        position: { x: cx - size.w / 2, y: cy - size.h / 2 },
        style: type === 'imageInputNode' || type === 'videoInputNode' ? { width: size.w } : { width: size.w, height: size.h },
        data: { label: '', status: 'idle', ...getLastNodeSettings(type, state.nodes) },
      });
    },
    [addNode],
  );

  // ── Clicks and drags ───────────────────────────────────────────────────
  const breakGroupSelection = useCallback((node: Node) => {
    if (node.type === 'groupNode') return;
    const state = useCreatorFlowStore.getState();
    const groups = state.nodes.filter((n) => n.type === 'groupNode' && n.selected);
    const isMember = groups.some((g) => (g.data?.memberIds as string[] | undefined)?.includes(node.id));
    if (!isMember) return;
    state.replaceNodes(state.nodes.map((n) => (n.id === node.id ? n : { ...n, selected: false })));
  }, []);

  const handleNodeClick = useCallback(
    (_e: React.MouseEvent, node: Node) => {
      breakGroupSelection(node);
      if (node.type === 'groupNode' || nodes.some((n) => n.type === 'groupNode' && (n.data?.memberIds as string[] | undefined)?.includes(node.id))) {
        setPotentialGroupIds(null);
        return;
      }
      const visited = new Set<string>([node.id]);
      const queue = [node.id];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        for (const edge of edges) {
          const next = edge.source === cur ? edge.target : edge.target === cur ? edge.source : null;
          if (!next || visited.has(next)) continue;
          const nn = nodes.find((n) => n.id === next);
          if (!nn || nn.type === 'groupNode') continue;
          visited.add(next);
          queue.push(next);
        }
      }
      setPotentialGroupIds(visited.size > 1 ? visited : null);
    },
    [breakGroupSelection, nodes, edges],
  );

  const handleNodeDragStart: OnNodeDrag = useCallback(
    (_e, node) => {
      pushUndoSnapshot();
      breakGroupSelection(node);
      setPotentialGroupIds(null);
    },
    [breakGroupSelection, pushUndoSnapshot],
  );

  const handleNodeDragStop = useCallback(() => {
    setSnapGuides([]);
    snapTargetRef.current = null;
    requestFlowSync();
  }, []);

  // ── Derived render props ───────────────────────────────────────────────
  const computedNodes = useMemo(() => {
    if (isRubberBand && dyingNodeIds.size === 0) return nodes;
    const selIds = selectedIdsRef.current;
    const anySelected = selIds.size > 0;
    const lockedMembers = new Set<string>();
    nodes.filter((n) => n.type === 'groupNode' && n.data?.locked).forEach((g) => (g.data?.memberIds as string[] | undefined)?.forEach((m) => lockedMembers.add(m)));
    const hasPotential = potentialGroupIds !== null && potentialGroupIds.size > 0;
    return nodes.map((n) => {
      const inGroup = hasPotential && potentialGroupIds!.has(n.id);
      const highlighted = selIds.has(n.id) || ancestorIds.has(n.id) || inGroup;
      const dimmed = !isRubberBand && (anySelected || hasPotential) && !highlighted && !isConnecting;
      const dying = dyingNodeIds.has(n.id);
      return {
        ...n,
        draggable: lockedMembers.has(n.id) || (n.type === 'groupNode' && !!n.data?.locked) ? false : undefined,
        className: [n.className, ancestorIds.has(n.id) ? 'node-ancestor' : null, inGroup && !selIds.has(n.id) && !ancestorIds.has(n.id) ? 'node-group-preview' : null, dying ? 'node-dying' : null].filter(Boolean).join(' ') || undefined,
        style: { ...n.style, opacity: dying ? undefined : dimmed ? 0.25 : undefined, transition: dying || isRubberBand ? undefined : anySelected || hasPotential ? 'opacity 150ms' : undefined },
      };
    });
  }, [nodes, ancestorIds, potentialGroupIds, dyingNodeIds, isConnecting, isRubberBand]);

  const computedEdges = useMemo(() => {
    const selIds = selectedIdsRef.current;
    const anySelected = selIds.size > 0;
    const hasPotential = potentialGroupIds !== null && potentialGroupIds.size > 0;
    return edges.map((e) => {
      const isAncestor = ancestorEdgeIds.has(e.id);
      const isGroup = hasPotential && potentialGroupIds!.has(e.source) && potentialGroupIds!.has(e.target);
      return {
        ...e,
        className: isAncestor ? [e.className, 'edge-ancestor'].filter(Boolean).join(' ') : e.className,
        data: { ...e.data, dying: dyingEdgeIds.has(e.id), dimmed: (anySelected || hasPotential) && !isAncestor && !isGroup },
      };
    });
  }, [edges, ancestorEdgeIds, potentialGroupIds, dyingEdgeIds]);

  const genCount = nodes.filter((n) => GEN_NODE_TYPES.has(n.type ?? '')).length;

  return (
    <FlowActionsContext.Provider value={actions}>
      <div ref={wrapperRef} className={cn('cflow relative flex h-full min-h-0 w-full min-w-0 flex-1 flex-col', activeTool === 'hand' && 'canvas-hand-mode', isRubberBand && 'is-rubber-band-selecting')} onMouseMoveCapture={(e) => { mousePosRef.current = { x: e.clientX, y: e.clientY }; }}>
        <ReactFlow
          nodes={computedNodes}
          edges={computedEdges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onSelectionChange={onSelectionChange}
          onNodeClick={handleNodeClick}
          onPaneClick={() => setPotentialGroupIds(null)}
          onNodeDragStart={handleNodeDragStart}
          onNodeDragStop={handleNodeDragStop}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          isValidConnection={isValidConnection}
          onSelectionStart={() => { rubberBandRef.current = true; setIsRubberBand(true); }}
          onSelectionEnd={() => { rubberBandRef.current = false; setIsRubberBand(false); runAncestorBFS(); }}
          onMove={(_, vp) => { viewportRef.current = vp; saveViewport(vp); }}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          minZoom={0.05}
          colorMode="dark"
          className="flex-1"
          style={{ background: 'transparent' }}
          panOnDrag={activeTool === 'hand' ? [0] : [1, 2]}
          selectionOnDrag={activeTool !== 'hand'}
          nodesDraggable={activeTool !== 'hand'}
          deleteKeyCode={['Delete', 'Backspace']}
          multiSelectionKeyCode="Shift"
          panOnScroll
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ animated: false }}
        >
          <Background variant={BackgroundVariant.Dots} gap={28} size={1.4} color="rgba(255,255,255,0.18)" />
          <ViewportSyncer />
          <GroupPreviewOverlay groupIds={potentialGroupIds} />
          <SelectionToolbar />
          {dropState && <NodePickerMenu dropState={dropState} onClose={() => setDropState(null)} />}
          {addMenuAnchor && <AddNodeMenu anchorRect={addMenuAnchor} onClose={() => setAddMenuAnchor(null)} />}
          <Controls showInteractive={false} />
        </ReactFlow>

        <CanvasToolbar
          activeTool={activeTool}
          onToolChange={setActiveTool}
          onAddNode={(rect) => setAddMenuAnchor(rect)}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          onShare={() => setShareOpen(true)}
          isPublic={activeIsPublic}
        />
        <span data-flow-add className="pointer-events-none absolute left-[21px] top-[calc(50%-90px)] h-px w-px" aria-hidden />

        {/* Run */}
        <div className="absolute right-4 top-4 z-[100] flex items-center gap-2">
          <button
            type="button"
            onClick={runAll}
            disabled={genCount === 0 || isRunning || planning}
            className={cn(
              'flex h-9 items-center gap-2 rounded-full border px-4 text-[13px] font-semibold backdrop-blur-xl transition',
              genCount === 0 || isRunning || planning ? 'border-white/10 bg-white/5 text-white/40' : 'border-white/20 bg-white text-black hover:bg-zinc-200',
            )}
          >
            {isRunning || planning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {isRunning ? t('creatorFlow.running') : t('creatorFlow.runFlow', { count: genCount })}
          </button>
        </div>

        {snapGuides.length > 0 && (
          <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full">
            {snapGuides.map((g, i) => {
              const { x: panX, y: panY, zoom } = viewportRef.current;
              return g.type === 'h' ? (
                <line key={i} x1={-100000} y1={g.canvasPos * zoom + panY} x2={100000} y2={g.canvasPos * zoom + panY} stroke="rgba(255,255,255,0.5)" strokeWidth={1} />
              ) : (
                <line key={i} x1={g.canvasPos * zoom + panX} y1={-100000} x2={g.canvasPos * zoom + panX} y2={100000} stroke="rgba(255,255,255,0.5)" strokeWidth={1} />
              );
            })}
          </svg>
        )}

        {nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center">
            <div className="flex flex-col items-center gap-10">
              <div className="flex flex-col items-center gap-3">
                <h2 className="text-[26px] font-semibold tracking-tight text-white">{t('creatorFlow.welcomeTitle')}</h2>
                <p className="text-[14px] text-white/40">{t('creatorFlow.welcomeSubtitle')}</p>
              </div>
              <div className="pointer-events-auto flex flex-wrap items-stretch justify-center gap-4">
                {[
                  { type: 'promptNode', labelKey: 'creatorFlow.nodeText', descKey: 'creatorFlow.welcomeText', icon: <MessageSquare size={20} strokeWidth={1.6} /> },
                  { type: 'imageGenNode', labelKey: 'creatorFlow.nodeImageGen', descKey: 'creatorFlow.welcomeImage', icon: <Sparkles size={20} strokeWidth={1.6} /> },
                  { type: 'videoGenNode', labelKey: 'creatorFlow.nodeVideoGen', descKey: 'creatorFlow.welcomeVideo', icon: <Clapperboard size={20} strokeWidth={1.6} /> },
                ].map((card) => (
                  <button
                    key={card.type}
                    type="button"
                    onClick={() => addNodeAtCenter(card.type)}
                    className="flex w-[210px] flex-col items-start gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 text-left backdrop-blur-sm transition hover:-translate-y-1 hover:border-white/30 hover:bg-white/10"
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white">{card.icon}</span>
                    <span>
                      <span className="block text-[15px] font-semibold text-white">{t(card.labelKey)}</span>
                      <span className="mt-1.5 block text-[12.5px] leading-snug text-white/45">{t(card.descKey)}</span>
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] tracking-wide text-white/25">{t('creatorFlow.welcomeDrop')}</p>
            </div>
          </div>
        )}

        {log.length > 0 && (
          <div className="absolute bottom-4 left-20 z-[90] max-h-28 w-[min(420px,calc(100%-9rem))] overflow-y-auto rounded-xl border border-white/10 bg-zinc-950/90 px-3 py-2 backdrop-blur-xl">
            {log.map((l, i) => (
              <p key={i} className={cn('font-mono text-[11px] leading-5', l.ok ? 'text-zinc-400' : 'text-white')}>{l.text}</p>
            ))}
          </div>
        )}

        <ShareModal flowId={activeFlowId} open={shareOpen} onOpenChange={setShareOpen} canPublish={signedIn} onSyncNow={onSyncNow} />
        <FlowPaywall plan={plan} open={plan !== null} onOpenChange={(o) => { if (!o) setPlan(null); }} onConfirm={(tx) => void confirmRun(tx)} />
      </div>
    </FlowActionsContext.Provider>
  );
}

export default function FlowCanvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
