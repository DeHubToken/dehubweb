/**
 * Creator Flow — graph execution helpers.
 * =======================================
 *
 * Pure functions over the node/edge arrays: execution order, parallel waves,
 * and resolving what a generator node is wired to. Nothing here touches the
 * network; the runner does that.
 */
import type { FlowEdge, FlowNode } from './types';
import { GEN_NODE_TYPES } from './types';

/** Topological sort — node ids in execution order. */
export function topoSort(nodes: FlowNode[], edges: FlowEdge[]): string[] {
  const adj: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};
  for (const n of nodes) {
    adj[n.id] = [];
    inDegree[n.id] = 0;
  }
  for (const e of edges) {
    if (!adj[e.source] || inDegree[e.target] === undefined) continue;
    adj[e.source].push(e.target);
    inDegree[e.target] += 1;
  }
  const queue = Object.entries(inDegree)
    .filter(([, d]) => d === 0)
    .map(([id]) => id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adj[id]) {
      inDegree[next] -= 1;
      if (inDegree[next] === 0) queue.push(next);
    }
  }
  return order;
}

/**
 * Waves of generator node ids in dependency order. Nodes in the same wave have
 * no dependency on each other and run in parallel; each wave finishes before
 * the next starts.
 */
export function buildPipelineWaves(nodes: FlowNode[], edges: FlowEdge[]): string[][] {
  const genIds = new Set(nodes.filter((n) => GEN_NODE_TYPES.has(n.type ?? '')).map((n) => n.id));
  if (genIds.size === 0) return [];

  const deps = new Map<string, Set<string>>();
  for (const id of genIds) deps.set(id, new Set());
  for (const e of edges) {
    if (genIds.has(e.source) && genIds.has(e.target)) deps.get(e.target)!.add(e.source);
  }

  const waves: string[][] = [];
  const remaining = new Set(genIds);
  while (remaining.size > 0) {
    const wave = [...remaining].filter((id) => [...(deps.get(id) ?? [])].every((dep) => !remaining.has(dep)));
    if (wave.length === 0) break; // cycle guard
    waves.push(wave);
    for (const id of wave) remaining.delete(id);
  }
  return waves;
}

/** The still a node offers to an image-consuming handle. */
export function imageUrlOf(src: FlowNode): string | undefined {
  const d = src.data;
  if (src.type === 'videoInputNode' || src.type === 'videoGenNode') {
    return (d.capturedFrameUrl as string | undefined) || undefined;
  }
  return ((d.imageUrl ?? d.inputImage) as string | undefined) || undefined;
}

/** The clip a node offers to a video-consuming handle. */
export function videoUrlOf(src: FlowNode): string | undefined {
  return (src.data.videoUrl as string | undefined) || undefined;
}

export interface ResolvedInputs {
  prompt?: string;
  imageUrls: string[];
  /** Node labels in the same order as imageUrls, for @mentions. */
  imageNodeLabels: string[];
  startFrameUrl?: string;
  endFrameUrl?: string;
  referenceVideoUrls: string[];
}

/** Resolve upstream prompt and media for a target node. */
export function resolveInputs(nodeId: string, nodes: FlowNode[], edges: FlowEdge[]): ResolvedInputs {
  const result: ResolvedInputs = { imageUrls: [], imageNodeLabels: [], referenceVideoUrls: [] };
  const byId = new Map(nodes.map((n) => [n.id, n]));

  for (const edge of edges) {
    if (edge.target !== nodeId) continue;
    const src = byId.get(edge.source);
    if (!src) continue;

    if (src.type === 'promptNode') result.prompt = src.data.prompt as string | undefined;
    if (src.type === 'assistantNode') result.prompt = src.data.outputText as string | undefined;

    switch (edge.targetHandle) {
      case 'image': {
        const url = imageUrlOf(src);
        if (url) {
          result.imageUrls.push(url);
          result.imageNodeLabels.push((src.data.label as string | undefined) ?? '');
        }
        // Carry an upstream generator's prompt when this node has none of its own.
        if ((src.type === 'imageGenNode' || src.type === 'videoGenNode') && src.data.prompt && !result.prompt) {
          result.prompt = src.data.prompt as string;
        }
        break;
      }
      case 'startFrame': {
        const url = imageUrlOf(src);
        if (url) result.startFrameUrl = url;
        break;
      }
      case 'endFrame': {
        const url = imageUrlOf(src);
        if (url) result.endFrameUrl = url;
        break;
      }
      case 'referenceVideo': {
        const url = videoUrlOf(src);
        if (url) result.referenceVideoUrls.push(url);
        break;
      }
      default:
        break;
    }
  }
  return result;
}

/**
 * Replace `@Label` mentions in a prompt with `<<<image N>>>` markers and order
 * the reference URLs by first appearance, so "put @IMAGE #2 next to @IMAGE #1"
 * hands the model the images in the order the sentence names them.
 */
export function resolveMentions(
  prompt: string,
  labels: string[],
  imageUrls: string[],
): { resolvedPrompt: string; orderedUrls: string[] } {
  if (!labels.length) return { resolvedPrompt: prompt, orderedUrls: imageUrls };

  type Span = { start: number; end: number; labelIdx: number | null };
  const spans: Span[] = [];
  const claimed = new Set<number>();

  const sortedLabels = labels
    .map((label, i) => ({ label, i }))
    .filter(({ label }) => !!label)
    .sort((a, b) => b.label.length - a.label.length);

  for (const { label, i } of sortedLabels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`@${escaped}`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(prompt)) !== null) {
      if (!claimed.has(m.index)) {
        spans.push({ start: m.index, end: m.index + m[0].length, labelIdx: i });
        claimed.add(m.index);
      }
    }
  }

  const fallback = /@\S+(?:\s+#\d+)?/g;
  let fm: RegExpExecArray | null;
  while ((fm = fallback.exec(prompt)) !== null) {
    if (!claimed.has(fm.index)) {
      spans.push({ start: fm.index, end: fm.index + fm[0].length, labelIdx: null });
      claimed.add(fm.index);
    }
  }

  spans.sort((a, b) => a.start - b.start);
  if (spans.length === 0) return { resolvedPrompt: prompt, orderedUrls: imageUrls };

  const spanUrls: (string | null)[] = [];
  const usedIdxs = new Set<number>();
  for (const span of spans) {
    let url: string | null = null;
    if (span.labelIdx !== null && !usedIdxs.has(span.labelIdx) && imageUrls[span.labelIdx]) {
      url = imageUrls[span.labelIdx];
      usedIdxs.add(span.labelIdx);
    } else {
      const next = imageUrls.findIndex((_, j) => !usedIdxs.has(j));
      if (next !== -1) {
        url = imageUrls[next];
        usedIdxs.add(next);
      }
    }
    spanUrls.push(url);
  }

  const orderedUrls = spanUrls.filter((u): u is string => u !== null);
  // Anything wired but never mentioned still rides along, after the named ones.
  for (let j = 0; j < imageUrls.length; j += 1) if (!usedIdxs.has(j)) orderedUrls.push(imageUrls[j]);

  let resolvedPrompt = '';
  let lastEnd = 0;
  let imageNum = 1;
  for (let i = 0; i < spans.length; i += 1) {
    resolvedPrompt += prompt.slice(lastEnd, spans[i].start);
    resolvedPrompt += spanUrls[i] !== null ? `<<<image ${imageNum++}>>>` : prompt.slice(spans[i].start, spans[i].end);
    lastEnd = spans[i].end;
  }
  resolvedPrompt += prompt.slice(lastEnd);
  return { resolvedPrompt, orderedUrls };
}

/** True when the node can receive a text prompt on a free `prompt` handle. */
export function nodeAcceptsPromptInput(node: FlowNode, edges: FlowEdge[]): boolean {
  if (node.type !== 'imageGenNode' && node.type !== 'videoGenNode') return false;
  return !edges.some((e) => e.target === node.id && e.targetHandle === 'prompt');
}
