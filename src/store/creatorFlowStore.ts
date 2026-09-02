/**
 * Creator Flow store.
 * ===================
 *
 * Every flow the creator has (nodes, edges, viewport, counters) plus the live
 * copy of the active one, undo/redo, and the per-type defaults new nodes
 * inherit. Persisted to localStorage per wallet — the same scoping the
 * generation library uses, so one person's canvases are not left on the page
 * for whoever connects next on a shared machine — and mirrored to the
 * creator_flows table by `useFlowSync` once a wallet is signed in.
 */
import { create } from 'zustand';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import type { Flow, FlowEdge, FlowNode, NodeData, Viewport } from '@/lib/creator/flow/types';
import { nodeLabel, uid } from '@/lib/creator/flow/types';
import { edgeStyle } from '@/lib/creator/flow/edgeStyles';
import { requestFlowSync } from '@/lib/creator/flow/syncBus';

const STORAGE_PREFIX = 'dehub-creator-flow-v1';
const MAX_UNDO = 50;

function scopeKey(wallet: string | null | undefined): string {
  return wallet ? `${STORAGE_PREFIX}:${wallet.toLowerCase()}` : `${STORAGE_PREFIX}:anon`;
}

let storageKey = scopeKey(null);

/** Pick only the listed keys from an object; null if none are present. */
function filterKeys<T extends object>(obj: T, keys: (keyof T)[]): Partial<T> | null {
  const result: Partial<T> = {};
  let found = false;
  for (const k of keys) {
    if (k in obj) {
      result[k] = obj[k];
      found = true;
    }
  }
  return found ? result : null;
}

function makeFlow(name: string, partial?: Partial<Flow>): Flow {
  return {
    id: uid(),
    name,
    nodes: [],
    edges: [],
    nodeCounters: {},
    createdAt: Date.now(),
    ...partial,
  };
}

/** Sync the live nodes/edges/counters back into the flows array. */
function syncFlow(
  flows: Flow[],
  activeId: string,
  nodes: FlowNode[],
  edges: FlowEdge[],
  nodeCounters: Record<string, number>,
): Flow[] {
  return flows.map((f) => (f.id === activeId ? { ...f, nodes, edges, nodeCounters, updatedAt: Date.now() } : f));
}

/** Inline data URLs are session-only; only durable URLs are written. */
function stripInline(nodes: FlowNode[]): FlowNode[] {
  return nodes.map((n) => ({ ...n, data: { ...n.data, inputImage: undefined } }));
}

interface Persisted {
  flows: Flow[];
  activeFlowId: string;
  nodeDefaults: FlowState['nodeDefaults'];
  lastNodeSize: Record<string, { w: number; h: number }>;
}

function loadPersisted(): Persisted | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    if (!Array.isArray(parsed.flows) || parsed.flows.length === 0) return null;
    return {
      flows: parsed.flows,
      activeFlowId: parsed.activeFlowId ?? parsed.flows[0].id,
      nodeDefaults: parsed.nodeDefaults ?? { imageGenNode: {}, videoGenNode: {}, assistantNode: {} },
      lastNodeSize: parsed.lastNodeSize ?? {},
    };
  } catch {
    return null;
  }
}

function persist(state: FlowState) {
  if (typeof window === 'undefined') return;
  const flows = syncFlow(state.flows, state.activeFlowId, state.nodes, state.edges, state.nodeCounters).map((f) => ({
    ...f,
    nodes: stripInline(f.nodes),
  }));
  const payload: Persisted = {
    flows,
    activeFlowId: state.activeFlowId,
    nodeDefaults: state.nodeDefaults,
    lastNodeSize: state.lastNodeSize,
  };
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // Quota or private mode: the in-memory state still works, and the DB copy
    // is what survives anyway once signed in.
  }
}

interface Snapshot {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface FlowState {
  flows: Flow[];
  activeFlowId: string;

  nodes: FlowNode[];
  edges: FlowEdge[];
  nodeCounters: Record<string, number>;
  isRunning: boolean;
  /** Type being dragged during an active connection, for CSS filtering. */
  connectingHandleType: string | null;

  undoStack: Snapshot[];
  redoStack: Snapshot[];

  nodeDefaults: {
    imageGenNode: Partial<NodeData>;
    videoGenNode: Partial<NodeData>;
    assistantNode: Partial<NodeData>;
  };
  lastNodeSize: Record<string, { w: number; h: number }>;

  // ── flows ──
  createFlow: (name?: string, template?: { nodes: FlowNode[]; edges: FlowEdge[]; nodeCounters: Record<string, number> }) => string;
  switchFlow: (id: string) => void;
  renameFlow: (id: string, name: string) => void;
  deleteFlow: (id: string) => void;
  duplicateFlow: (id: string) => string | null;
  setFlowPublic: (id: string, isPublic: boolean) => void;
  saveViewport: (viewport: Viewport) => void;
  /** Merge rows loaded from the database with what is held locally. */
  loadFlowsFromDB: (flows: Flow[]) => void;
  /** Move to another wallet's storage (or anonymous). */
  setScope: (wallet: string | null) => void;
  clearLocalData: () => void;

  // ── graph ──
  onNodesChange: (changes: NodeChange<FlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<FlowEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (node: FlowNode) => void;
  insertEdge: (edge: FlowEdge) => void;
  replaceNodes: (nodes: FlowNode[]) => void;
  removeEdgesForHandle: (nodeId: string, handleId: string) => void;
  flashEdgeError: (edgeId: string) => void;
  updateNodeData: (id: string, data: Partial<NodeData>) => void;
  updateNodeSize: (id: string, width: number, height: number) => void;
  setIsRunning: (v: boolean) => void;
  setConnectingHandleType: (type: string | null) => void;

  pushUndoSnapshot: () => void;
  undo: () => void;
  redo: () => void;
}

const EMPTY_DEFAULTS: FlowState['nodeDefaults'] = { imageGenNode: {}, videoGenNode: {}, assistantNode: {} };

export const useCreatorFlowStore = create<FlowState>()((set, get) => {
  const loaded = loadPersisted();
  const initialFlows = loaded?.flows ?? [makeFlow('Flow 1')];
  const initialActive = loaded?.activeFlowId ?? initialFlows[0].id;
  const active = initialFlows.find((f) => f.id === initialActive) ?? initialFlows[0];

  /** Set state, then write it through. Every mutation goes through here. */
  const commit = (updater: (s: FlowState) => Partial<FlowState>) => {
    set(updater);
    persist(get());
  };

  const snapshot = (s: FlowState): Snapshot[] => [...s.undoStack.slice(-(MAX_UNDO - 1)), { nodes: s.nodes, edges: s.edges }];

  return {
    flows: initialFlows,
    activeFlowId: active.id,
    nodes: active.nodes,
    edges: active.edges,
    nodeCounters: active.nodeCounters,
    isRunning: false,
    connectingHandleType: null,
    undoStack: [],
    redoStack: [],
    nodeDefaults: loaded?.nodeDefaults ?? EMPTY_DEFAULTS,
    lastNodeSize: loaded?.lastNodeSize ?? {},

    // ── flows ────────────────────────────────────────────────────────────

    createFlow: (name, template) => {
      const flow = makeFlow(name ?? `Flow ${get().flows.length + 1}`, template ? { ...template } : undefined);
      commit((s) => ({
        flows: [...syncFlow(s.flows, s.activeFlowId, s.nodes, s.edges, s.nodeCounters), flow],
        activeFlowId: flow.id,
        nodes: template?.nodes ?? [],
        edges: template?.edges ?? [],
        nodeCounters: template?.nodeCounters ?? {},
        undoStack: [],
        redoStack: [],
      }));
      requestFlowSync();
      return flow.id;
    },

    switchFlow: (id) =>
      commit((s) => {
        if (id === s.activeFlowId) return {};
        const target = s.flows.find((f) => f.id === id);
        if (!target) return {};
        return {
          flows: syncFlow(s.flows, s.activeFlowId, s.nodes, s.edges, s.nodeCounters),
          activeFlowId: id,
          nodes: target.nodes,
          edges: target.edges,
          nodeCounters: target.nodeCounters,
          undoStack: [],
          redoStack: [],
        };
      }),

    renameFlow: (id, name) => {
      commit((s) => ({ flows: s.flows.map((f) => (f.id === id ? { ...f, name, updatedAt: Date.now() } : f)) }));
      requestFlowSync();
    },

    deleteFlow: (id) => {
      commit((s) => {
        const remaining = s.flows.filter((f) => f.id !== id);
        if (remaining.length === 0) {
          const fresh = makeFlow('Flow 1');
          return { flows: [fresh], activeFlowId: fresh.id, nodes: [], edges: [], nodeCounters: {}, undoStack: [], redoStack: [] };
        }
        if (s.activeFlowId !== id) return { flows: remaining };
        const next = remaining[0];
        return {
          flows: remaining,
          activeFlowId: next.id,
          nodes: next.nodes,
          edges: next.edges,
          nodeCounters: next.nodeCounters,
          undoStack: [],
          redoStack: [],
        };
      });
      requestFlowSync();
    },

    duplicateFlow: (id) => {
      const s = get();
      const synced = syncFlow(s.flows, s.activeFlowId, s.nodes, s.edges, s.nodeCounters);
      const original = synced.find((f) => f.id === id);
      if (!original) return null;
      const copy = makeFlow(`${original.name} (copy)`, {
        nodes: original.nodes.map((n) => ({ ...n, selected: false })),
        edges: original.edges,
        nodeCounters: original.nodeCounters,
        viewport: original.viewport,
      });
      commit(() => ({ flows: [...synced, copy] }));
      requestFlowSync();
      return copy.id;
    },

    setFlowPublic: (id, isPublic) =>
      commit((s) => ({ flows: s.flows.map((f) => (f.id === id ? { ...f, isPublic } : f)) })),

    saveViewport: (viewport) =>
      commit((s) => ({ flows: s.flows.map((f) => (f.id === s.activeFlowId ? { ...f, viewport } : f)) })),

    loadFlowsFromDB: (dbFlows) =>
      commit((s) => {
        if (!dbFlows.length) return {};
        const local = syncFlow(s.flows, s.activeFlowId, s.nodes, s.edges, s.nodeCounters);
        const localById = new Map(local.map((f) => [f.id, f]));

        // Newer copy wins per flow (local on tie). `isPublic` always comes
        // from the row: it is set server-side and the row is authoritative.
        const merged = dbFlows.map((db) => {
          const mine = localById.get(db.id);
          if (!mine) return db;
          const localTs = mine.updatedAt ?? mine.createdAt ?? 0;
          const dbTs = db.updatedAt ?? db.createdAt ?? 0;
          const base = localTs >= dbTs ? mine : db;
          return { ...base, isPublic: db.isPublic, coverUrl: db.coverUrl };
        });

        // Local-only flows survive when they hold anything, or are the one
        // open right now (it may have just been created and still be empty).
        const dbIds = new Set(dbFlows.map((f) => f.id));
        for (const f of local) {
          if (!dbIds.has(f.id) && (f.id === s.activeFlowId || f.nodes.length > 0 || f.edges.length > 0)) merged.push(f);
        }

        const activeId = merged.find((f) => f.id === s.activeFlowId)?.id ?? merged[0].id;
        const activeFlow = merged.find((f) => f.id === activeId)!;
        return {
          flows: merged,
          activeFlowId: activeId,
          nodes: activeFlow.nodes,
          edges: activeFlow.edges,
          nodeCounters: activeFlow.nodeCounters,
        };
      }),

    setScope: (wallet) => {
      const next = scopeKey(wallet);
      if (next === storageKey) return;
      persist(get());
      storageKey = next;
      const loadedNext = loadPersisted();
      const flows = loadedNext?.flows ?? [makeFlow('Flow 1')];
      const activeId = loadedNext?.activeFlowId ?? flows[0].id;
      const activeFlow = flows.find((f) => f.id === activeId) ?? flows[0];
      set({
        flows,
        activeFlowId: activeFlow.id,
        nodes: activeFlow.nodes,
        edges: activeFlow.edges,
        nodeCounters: activeFlow.nodeCounters,
        undoStack: [],
        redoStack: [],
        nodeDefaults: loadedNext?.nodeDefaults ?? EMPTY_DEFAULTS,
        lastNodeSize: loadedNext?.lastNodeSize ?? {},
        isRunning: false,
      });
    },

    clearLocalData: () => {
      const fresh = makeFlow('Flow 1');
      commit(() => ({ flows: [fresh], activeFlowId: fresh.id, nodes: [], edges: [], nodeCounters: {}, undoStack: [], redoStack: [] }));
    },

    // ── graph ────────────────────────────────────────────────────────────

    onNodesChange: (changes) => {
      commit((s) => {
        const nodes = applyNodeChanges(changes, s.nodes);
        const removedIds = new Set(changes.filter((c) => c.type === 'remove').map((c) => (c as { id: string }).id));
        const edges = removedIds.size > 0 ? s.edges.filter((e) => !removedIds.has(e.source) && !removedIds.has(e.target)) : s.edges;

        // The final size of a manual corner-drag (resizing === false) is
        // remembered per type so the next node of that type matches.
        let lastNodeSize = s.lastNodeSize;
        for (const c of changes) {
          if (c.type !== 'dimensions' || c.resizing !== false || !c.dimensions) continue;
          const nodeType = s.nodes.find((n) => n.id === c.id)?.type;
          if (!nodeType) continue;
          lastNodeSize = { ...lastNodeSize, [nodeType]: { w: c.dimensions.width, h: c.dimensions.height } };
        }
        return { nodes, edges, lastNodeSize, flows: syncFlow(s.flows, s.activeFlowId, nodes, edges, s.nodeCounters) };
      });
      const discrete = changes.some((c) => c.type === 'remove' || (c.type === 'dimensions' && c.resizing === false));
      if (discrete) requestFlowSync();
    },

    onEdgesChange: (changes) => {
      commit((s) => {
        const edges = applyEdgeChanges(changes, s.edges);
        return { edges, flows: syncFlow(s.flows, s.activeFlowId, s.nodes, edges, s.nodeCounters) };
      });
      if (changes.some((c) => c.type === 'remove')) requestFlowSync();
    },

    onConnect: (connection) => {
      commit((s) => {
        const edges = addEdge({ ...connection, animated: false, style: edgeStyle(connection.targetHandle) }, s.edges);
        return { edges, undoStack: snapshot(s), redoStack: [], flows: syncFlow(s.flows, s.activeFlowId, s.nodes, edges, s.nodeCounters) };
      });
      requestFlowSync();
    },

    addNode: (node) => {
      commit((s) => {
        const type = node.type ?? 'unknown';
        const count = (s.nodeCounters[type] ?? 0) + 1;
        const label = (node.data?.label as string | undefined) || nodeLabel(type, count);
        const savedDefaults =
          type === 'imageGenNode' ? s.nodeDefaults.imageGenNode
          : type === 'videoGenNode' ? s.nodeDefaults.videoGenNode
          : type === 'assistantNode' ? s.nodeDefaults.assistantNode
          : {};
        const nodes = [
          ...s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
          { ...node, selected: node.selected ?? true, data: { ...savedDefaults, ...node.data, label } },
        ];
        const nodeCounters = { ...s.nodeCounters, [type]: count };
        return { nodes, nodeCounters, undoStack: snapshot(s), redoStack: [], flows: syncFlow(s.flows, s.activeFlowId, nodes, s.edges, nodeCounters) };
      });
      requestFlowSync();
    },

    insertEdge: (edge) => {
      commit((s) => {
        const edges = [...s.edges, edge];
        return { edges, undoStack: snapshot(s), redoStack: [], flows: syncFlow(s.flows, s.activeFlowId, s.nodes, edges, s.nodeCounters) };
      });
      requestFlowSync();
    },

    replaceNodes: (nodes) =>
      commit((s) => ({ nodes, flows: syncFlow(s.flows, s.activeFlowId, nodes, s.edges, s.nodeCounters) })),

    removeEdgesForHandle: (nodeId, handleId) =>
      commit((s) => {
        const edges = s.edges.filter((e) => !(e.target === nodeId && e.targetHandle === handleId));
        return { edges, flows: syncFlow(s.flows, s.activeFlowId, s.nodes, edges, s.nodeCounters) };
      }),

    flashEdgeError: (edgeId) => {
      const setError = (val: boolean) =>
        set((s) => ({ edges: s.edges.map((e) => (e.id === edgeId ? { ...e, data: { ...e.data, error: val } } : e)) }));
      setError(true);
      setTimeout(() => setError(false), 1400);
    },

    updateNodeData: (id, data) =>
      commit((s) => {
        const nodes = s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n));
        const nodeType = s.nodes.find((n) => n.id === id)?.type;
        let nodeDefaults = s.nodeDefaults;
        if (nodeType === 'imageGenNode') {
          const pick = filterKeys(data, ['model', 'aspectRatio']);
          if (pick) nodeDefaults = { ...nodeDefaults, imageGenNode: { ...nodeDefaults.imageGenNode, ...pick } };
        } else if (nodeType === 'videoGenNode') {
          const pick = filterKeys(data, ['model', 'aspectRatio', 'duration', 'resolution']);
          if (pick) nodeDefaults = { ...nodeDefaults, videoGenNode: { ...nodeDefaults.videoGenNode, ...pick } };
        } else if (nodeType === 'assistantNode') {
          const pick = filterKeys(data, ['assistantModel']);
          if (pick) nodeDefaults = { ...nodeDefaults, assistantNode: { ...nodeDefaults.assistantNode, ...pick } };
        }
        return { nodes, nodeDefaults, flows: syncFlow(s.flows, s.activeFlowId, nodes, s.edges, s.nodeCounters) };
      }),

    updateNodeSize: (id, width, height) =>
      commit((s) => {
        const GROUP_PADDING = 24;
        let nodes = s.nodes.map((n) => (n.id === id ? { ...n, width, height, style: { ...n.style, width, height } } : n));
        // Grow a group that the resized member now exceeds; never shrink it.
        nodes = nodes.map((g) => {
          if (g.type !== 'groupNode') return g;
          const memberIds = g.data?.memberIds as string[] | undefined;
          if (!memberIds?.includes(id)) return g;
          const node = nodes.find((n) => n.id === id);
          if (!node) return g;
          const gx = g.position.x;
          const gy = g.position.y;
          const gw = (g.style?.width as number | undefined) ?? 0;
          const gh = (g.style?.height as number | undefined) ?? 0;
          const reqX = Math.min(gx, node.position.x - GROUP_PADDING);
          const reqY = Math.min(gy, node.position.y - GROUP_PADDING);
          const reqR = Math.max(gx + gw, node.position.x + width + GROUP_PADDING);
          const reqB = Math.max(gy + gh, node.position.y + height + GROUP_PADDING);
          if (reqX === gx && reqY === gy && reqR === gx + gw && reqB === gy + gh) return g;
          return { ...g, position: { x: reqX, y: reqY }, style: { ...g.style, width: reqR - reqX, height: reqB - reqY } };
        });
        return { nodes, flows: syncFlow(s.flows, s.activeFlowId, nodes, s.edges, s.nodeCounters) };
      }),

    setIsRunning: (v) => set({ isRunning: v }),
    setConnectingHandleType: (type) => set({ connectingHandleType: type }),

    // ── undo / redo ──────────────────────────────────────────────────────

    pushUndoSnapshot: () => set((s) => ({ undoStack: snapshot(s), redoStack: [] })),

    undo: () =>
      commit((s) => {
        if (s.undoStack.length === 0) return {};
        const snap = s.undoStack[s.undoStack.length - 1];
        return {
          nodes: snap.nodes,
          edges: snap.edges,
          undoStack: s.undoStack.slice(0, -1),
          redoStack: [...s.redoStack, { nodes: s.nodes, edges: s.edges }],
          flows: syncFlow(s.flows, s.activeFlowId, snap.nodes, snap.edges, s.nodeCounters),
        };
      }),

    redo: () =>
      commit((s) => {
        if (s.redoStack.length === 0) return {};
        const snap = s.redoStack[s.redoStack.length - 1];
        return {
          nodes: snap.nodes,
          edges: snap.edges,
          undoStack: [...s.undoStack, { nodes: s.nodes, edges: s.edges }],
          redoStack: s.redoStack.slice(0, -1),
          flows: syncFlow(s.flows, s.activeFlowId, snap.nodes, snap.edges, s.nodeCounters),
        };
      }),
  };
});

/** The active flow with the live graph folded in. */
export function selectActiveFlow(s: FlowState): Flow | undefined {
  const f = s.flows.find((x) => x.id === s.activeFlowId);
  return f ? { ...f, nodes: s.nodes, edges: s.edges, nodeCounters: s.nodeCounters } : undefined;
}
